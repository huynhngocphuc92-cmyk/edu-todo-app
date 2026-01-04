'use client';
import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Toaster, toast } from 'react-hot-toast';

export default function DashboardPage() {
  const [tasks, setTasks] = useState([]);
  
  // --- STATE DỰ ÁN ---
  const [projectId, setProjectId] = useState('personal');
  const [inputProjectId, setInputProjectId] = useState('');
  
  const [newTask, setNewTask] = useState('');
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [isBrowser, setIsBrowser] = useState(false);

  // --- DARK MODE, UPLOAD, SEARCH ---
  const [darkMode, setDarkMode] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // --- MODALS ---
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState(null);
  
  // --- STATE CHI TIẾT TASK & CHAT (MỚI) ---
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [activeTask, setActiveTask] = useState(null); // Task đang mở
  const [comments, setComments] = useState([]); // Danh sách chat của task đang mở
  const [newComment, setNewComment] = useState(''); // Nội dung chat mới
  const chatEndRef = useRef(null); // Để tự cuộn xuống tin nhắn mới nhất

  const supabase = createClient();
  const router = useRouter();

  // --- 1. SETUP DATA ---
  useEffect(() => {
    setIsBrowser(true);
    const getUserAndTasks = async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        router.push('/login');
        return;
      }
      setUser(user);
      
      const { data: todos } = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
        
      if (todos) {
        const normalizedTasks = todos.map(t => ({...t, status: t.status || 'todo'}));
        setTasks(normalizedTasks);
      }
      setLoading(false);
    };
    getUserAndTasks();
  }, [router, supabase, projectId]);

  // --- 2. REAL-TIME TASKS ---
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`room-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` }, (payload) => {
        if (payload.eventType === 'INSERT') setTasks((prev) => [{ ...payload.new, status: payload.new.status || 'todo' }, ...prev]);
        if (payload.eventType === 'DELETE') setTasks((prev) => prev.filter((t) => t.id !== payload.old.id));
        if (payload.eventType === 'UPDATE') setTasks((prev) => prev.map((t) => t.id === payload.new.id ? payload.new : t));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, user, projectId]);

  // --- 3. LOGIC CHAT REAL-TIME (ĐÃ FIX CHUẨN) ---
  useEffect(() => {
    // Chỉ chạy khi Modal mở và có ID task
    if (!isDetailModalOpen || !activeTask?.id) return;

    const taskId = activeTask.id;

    // 3.1 Load comment cũ
    const fetchComments = async () => {
        const { data } = await supabase
            .from('comments')
            .select('*')
            .eq('task_id', taskId)
            .order('created_at', { ascending: true });
        if (data) setComments(data);
    };
    fetchComments();

    // 3.2 Lắng nghe comment mới
    const channel = supabase
        .channel(`comments-${taskId}`)
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'comments', 
            filter: `task_id=eq.${taskId}` 
        }, (payload) => {
            setComments((prev) => {
                if (prev.some(c => c.id === payload.new.id)) return prev;
                return [...prev, payload.new];
            });
        })
        .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isDetailModalOpen, activeTask?.id, supabase]);

  // Tự động cuộn xuống cuối khi có tin nhắn mới
  useEffect(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);
  
  const handleSendComment = async () => {
    if (!newComment.trim() || !user) return;
    
    const contentBackup = newComment;
    setNewComment(''); 

    // Optimistic UI: Hiện tin nhắn ngay lập tức
    const tempId = Math.random().toString(36).substr(2, 9);
    const tempMsg = {
        id: tempId,
        content: contentBackup,
        task_id: activeTask.id,
        user_id: user.id,
        user_email: user.email,
        created_at: new Date().toISOString()
    };

    setComments(prev => [...prev, tempMsg]);

    const { data, error } = await supabase.from('comments').insert({
        content: contentBackup,
        task_id: activeTask.id,
        user_id: user.id,
        user_email: user.email
    }).select();

    if (error) {
        toast.error("Lỗi: " + error.message);
        setNewComment(contentBackup);
        setComments(prev => prev.filter(c => c.id !== tempId));
    } else {
        // Server trả về tin thật -> Thay thế tin tạm
        if (data && data.length > 0) {
             const realMsg = data[0];
             setComments(prev => prev.map(c => c.id === tempId ? realMsg : c));
        }
    }
  };
  const handleJoinProject = () => { if (inputProjectId.trim()) { setProjectId(inputProjectId.trim()); setInputProjectId(''); toast.success(`Đã vào: ${inputProjectId.trim()}`); }};
  const handleBackToPersonal = () => { setProjectId('personal'); toast('Về nhà'); };

  const onDragEnd = async (result) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    const newStatus = destination.droppableId;
    const updatedTasks = tasks.map(t => t.id === draggableId ? { ...t, status: newStatus } : t);
    setTasks(updatedTasks);
    await supabase.from('tasks').update({ status: newStatus }).eq('id', draggableId);
  };

  const addTodo = async () => {
    if (!newTask || !user) { toast.error('Nhập tên!'); return; }
    let imageUrl = null;
    if (selectedFile) {
        setIsUploading(true);
        const fileName = `${Date.now()}-${selectedFile.name}`;
        const { data } = await supabase.storage.from('task-images').upload(fileName, selectedFile); 
        if (data) {
            const { data: publicUrlData } = supabase.storage.from('task-images').getPublicUrl(fileName);
            imageUrl = publicUrlData.publicUrl;
        }
        setIsUploading(false);
    }
    const { error } = await supabase.from('tasks').insert([{ title: newTask, start_date: startDate, deadline: deadline, status: 'todo', user_id: user.id, image_url: imageUrl, project_id: projectId }]);
    if (!error) { setNewTask(''); setStartDate(''); setDeadline(''); setSelectedFile(null); toast.success('Thêm xong!'); }
  };

  const handleDeleteClick = (id) => { setTaskToDelete(id); setIsDeleteModalOpen(true); };
  const confirmDelete = async () => { if (taskToDelete) { await supabase.from('tasks').delete().match({ id: taskToDelete }); setIsDeleteModalOpen(false); setTaskToDelete(null); toast.success('Đã xóa!'); }};
  
  // Mở Modal Chi tiết (Thay cho Edit cũ)
  const handleOpenDetail = (task) => { setActiveTask(task); setIsDetailModalOpen(true); };
  
  const saveTaskUpdate = async () => {
      if (activeTask) {
          await supabase.from('tasks').update({
              title: activeTask.title,
              start_date: activeTask.start_date,
              deadline: activeTask.deadline
          }).eq('id', activeTask.id);
          
          // Cập nhật lại list bên ngoài
          setTasks(prev => prev.map(t => t.id === activeTask.id ? activeTask : t));
          toast.success('Đã lưu thông tin!');
      }
  };

  // --- HELPER CLASSES ---
  const bgMain = darkMode ? 'bg-slate-900' : 'bg-slate-50';
  const textMain = darkMode ? 'text-slate-100' : 'text-slate-800';
  const bgCard = darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100';
  const bgInput = darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-800';
  const textSub = darkMode ? 'text-slate-400' : 'text-slate-500';

  if (loading || !isBrowser) return <div className="h-screen flex items-center justify-center bg-slate-900 text-white">Đang tải...</div>;

  const filteredTasks = tasks.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const columns = {
    todo: { title: 'Cần làm', bg: darkMode ? 'bg-slate-800/50' : 'bg-slate-100/50', items: filteredTasks.filter(t => t.status === 'todo') },
    in_progress: { title: 'Đang làm', bg: darkMode ? 'bg-yellow-900/20' : 'bg-yellow-50/50', items: filteredTasks.filter(t => t.status === 'in_progress') },
    done: { title: 'Đã xong', bg: darkMode ? 'bg-green-900/20' : 'bg-green-50/50', items: filteredTasks.filter(t => t.status === 'done') }
  };

  return (
    <div className={`min-h-screen py-8 px-4 font-sans transition-colors duration-300 ${bgMain} ${textMain}`}>
      <Toaster position="top-center" />
      <div className="max-w-6xl mx-auto">
        
        {/* HEADER */}
        <div className={`flex flex-col md:flex-row justify-between items-center mb-6 p-5 rounded-2xl shadow-sm border gap-4 ${bgCard}`}>
            <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="h-12 w-12 rounded-full border border-indigo-500/30 overflow-hidden p-0.5">
                    <img src={`https://api.dicebear.com/9.x/notionists/svg?seed=${user?.email}`} alt="Avatar" className="h-full w-full object-cover rounded-full bg-slate-200" />
                </div>
                <div>
                    <h1 className="text-xl font-extrabold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">Education Manager</h1>
                    <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${projectId === 'personal' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>{projectId === 'personal' ? '🏠 Cá nhân' : `🏢 Dự án: ${projectId}`}</span>
                        <p className={`text-xs ${textSub}`}>{user?.email}</p>
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                 <div className={`flex items-center px-3 py-2.5 rounded-xl border ${bgInput} w-full md:w-48`}>
                    <span className="mr-2 opacity-50">🔍</span>
                    <input type="text" placeholder="Tìm..." className="bg-transparent outline-none w-full text-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
                 <div className={`flex items-center px-2 py-1.5 rounded-xl border ${bgInput}`}>
                    <input type="text" placeholder="Mã dự án..." className="bg-transparent outline-none w-24 text-sm" value={inputProjectId} onChange={(e) => setInputProjectId(e.target.value.toUpperCase())} />
                    <button onClick={handleJoinProject} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700 ml-1">Vào</button>
                </div>
                {projectId !== 'personal' && <button onClick={handleBackToPersonal} className="text-xs bg-slate-200 text-slate-600 px-3 py-2 rounded-xl hover:bg-slate-300 font-bold">Về</button>}
                <button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-xl ${darkMode ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-100 text-slate-500'}`}>{darkMode ? '☀️' : '🌙'}</button>
            </div>
        </div>

        {/* INPUT FORM */}
        <div className={`p-2 rounded-2xl shadow-lg border mb-8 flex flex-col md:flex-row gap-2 ${bgCard} ${darkMode ? 'border-indigo-900/50' : 'border-indigo-50'}`}>
            <input type="text" placeholder={`Thêm việc vào ${projectId === 'personal' ? 'cá nhân' : projectId}...`} className={`flex-1 p-3 bg-transparent outline-none font-medium pl-4 ${darkMode ? 'text-white' : 'text-slate-800'}`} value={newTask} onChange={(e) => setNewTask(e.target.value)} />
            <div className="flex gap-2 p-1 items-center">
                 <label className={`cursor-pointer p-3 rounded-xl hover:bg-slate-200 transition relative ${selectedFile ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => setSelectedFile(e.target.files[0])} />
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                    {selectedFile && <div className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full border-2 border-white"></div>}
                </label>
                <input type="date" className={`p-2 rounded-xl outline-none text-sm font-medium ${bgInput}`} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <input type="date" className={`p-2 rounded-xl outline-none text-sm font-medium ${bgInput}`} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                <button onClick={addTodo} disabled={isUploading} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 rounded-xl font-bold transition shadow-md active:scale-95">{isUploading ? '...' : '+'}</button>
            </div>
        </div>

        <DragDropContext onDragEnd={onDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Object.entries(columns).map(([columnId, column]) => (
                    <div key={columnId} className={`p-4 rounded-2xl ${column.bg} min-h-[500px] flex flex-col transition-colors`}>
                        <div className="flex justify-between items-center mb-4 px-2">
                            <h2 className={`font-bold ${columnId === 'todo' ? (darkMode ? 'text-slate-300' : 'text-slate-700') : columnId === 'in_progress' ? 'text-yellow-600' : 'text-green-600'}`}>{column.title}</h2>
                            <span className={`px-2 py-1 rounded-lg text-xs font-bold ${bgCard} ${textSub}`}>{column.items.length}</span>
                        </div>
                        <Droppable droppableId={columnId}>
                            {(provided) => (
                                <div {...provided.droppableProps} ref={provided.innerRef} className="flex-1 space-y-3">
                                    {column.items.map((task, index) => (
                                        <Draggable key={task.id} draggableId={task.id} index={index}>
                                            {(provided) => (
                                                <div
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    {...provided.dragHandleProps}
                                                    className={`p-4 rounded-xl shadow-sm border hover:shadow-md transition-all group relative ${bgCard} flex flex-col`}
                                                >
                                                    {/* 1. ẢNH TASK */}
                                                    {task.image_url && (
                                                        <div className="mb-3 rounded-lg overflow-hidden h-32 w-full bg-slate-100 relative group/img shrink-0">
                                                            <img src={task.image_url} alt="img" className="h-full w-full object-cover" />
                                                            <a
                                                                href={task.image_url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover/img:opacity-100 text-white"
                                                            >
                                                                Open
                                                            </a>
                                                        </div>
                                                    )}

                                                    {/* 2. TIÊU ĐỀ */}
                                                    <h3 className={`font-semibold mb-2 leading-tight ${textMain}`}>{task.title}</h3>

                                                    {/* 3. NGƯỜI TẠO (Nếu dự án chung) */}
                                                    {projectId !== 'personal' && task.user_id !== user?.id && (
                                                        <div className="mb-2">
                                                            <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded border border-purple-200 font-mono">
                                                                👤 By: {task.user_id.slice(0, 6)}...
                                                            </span>
                                                        </div>
                                                    )}

                                                    {/* 4. THỜI GIAN */}
                                                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide mb-3">
                                                        {task.start_date && (
                                                            <span className={`px-2 py-1 rounded ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-50 text-slate-400'}`}>
                                                                {task.start_date}
                                                            </span>
                                                        )}
                                                        {task.deadline && (
                                                            <span className={`px-2 py-1 rounded ${darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-500'}`}>
                                                                {task.deadline}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* 5. NÚT HÀNH ĐỘNG DƯỚI CÙNG */}
                                                    <div className={`mt-auto pt-3 border-t flex justify-end gap-2 ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                                                        {/* Chat */}
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleOpenDetail(task); }}
                                                            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors ${darkMode
                                                                ? 'bg-slate-700 text-slate-300 hover:bg-purple-900/50 hover:text-purple-400'
                                                                : 'bg-slate-100 text-slate-500 hover:bg-purple-100 hover:text-purple-600'
                                                            }`}
                                                        >
                                                            💬 Chat
                                                        </button>
                                                        {/* Edit */}
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleOpenDetail(task); }}
                                                            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors ${darkMode
                                                                ? 'bg-slate-700 text-slate-300 hover:bg-blue-900/50 hover:text-blue-400'
                                                                : 'bg-slate-100 text-slate-500 hover:bg-blue-100 hover:text-blue-600'
                                                            }`}
                                                        >
                                                            ✏️ Sửa
                                                        </button>
                                                        {/* Delete */}
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteClick(task.id); }}
                                                            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors ${darkMode
                                                                ? 'bg-slate-700 text-slate-300 hover:bg-red-900/50 hover:text-red-400'
                                                                : 'bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-600'
                                                            }`}
                                                        >
                                                            🗑️ Xóa
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </Draggable>
                                    ))}
                                    {provided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    </div>
                ))}
            </div>
        </DragDropContext>

        {/* MODAL XÓA */}
        {isDeleteModalOpen && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className={`rounded-2xl p-6 text-center shadow-2xl max-w-sm w-full ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
                    <h3 className={`text-lg font-bold mb-4 ${textMain}`}>Xóa thật không?</h3>
                    <div className="flex gap-3">
                        <button onClick={() => setIsDeleteModalOpen(false)} className="flex-1 py-2 bg-slate-200 rounded-xl">Hủy</button>
                        <button onClick={confirmDelete} className="flex-1 py-2 bg-red-500 text-white rounded-xl shadow-lg">Xóa</button>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL CHI TIẾT & CHAT (MỚI) */}
        {isDetailModalOpen && activeTask && (
             <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
                <div className={`rounded-2xl shadow-2xl max-w-4xl w-full h-[80vh] flex flex-col md:flex-row overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
                    
                    {/* CỘT TRÁI: THÔNG TIN TASK */}
                    <div className={`w-full md:w-1/2 p-6 border-b md:border-b-0 md:border-r ${darkMode ? 'border-slate-700' : 'border-slate-100'} overflow-y-auto`}>
                        <h3 className={`text-xl font-bold mb-6 ${textMain}`}>📝 Chi tiết nhiệm vụ</h3>
                        <div className="space-y-4">
                            <div>
                                <label className={`text-xs font-bold uppercase ${textSub}`}>Tên nhiệm vụ</label>
                                <input type="text" className={`w-full p-3 mt-1 border rounded-xl ${bgInput}`} value={activeTask.title} onChange={(e) => setActiveTask({...activeTask, title: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className={`text-xs font-bold uppercase ${textSub}`}>Bắt đầu</label><input type="date" className={`w-full p-3 mt-1 border rounded-xl ${bgInput}`} value={activeTask.start_date || ''} onChange={(e) => setActiveTask({...activeTask, start_date: e.target.value})} /></div>
                                <div><label className={`text-xs font-bold uppercase ${textSub}`}>Deadline</label><input type="date" className={`w-full p-3 mt-1 border rounded-xl ${bgInput}`} value={activeTask.deadline || ''} onChange={(e) => setActiveTask({...activeTask, deadline: e.target.value})} /></div>
                            </div>
                            <button onClick={saveTaskUpdate} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl mt-4 shadow-lg">Lưu thay đổi</button>
                            <button onClick={() => setIsDetailModalOpen(false)} className={`w-full py-3 mt-2 font-bold rounded-xl ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>Đóng</button>
                        </div>
                    </div>

                    {/* CỘT PHẢI: CHAT (COMMENTS) */}
                    <div className={`w-full md:w-1/2 flex flex-col ${darkMode ? 'bg-slate-900/50' : 'bg-slate-50'}`}>
                        <div className={`p-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                            <h3 className={`font-bold ${textMain}`}>💬 Thảo luận</h3>
                        </div>
                        
                        {/* DANH SÁCH TIN NHẮN */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {comments.length === 0 ? (
                                <p className="text-center text-slate-400 text-sm mt-10">Chưa có bình luận nào.</p>
                            ) : (
                                comments.map((cmt) => (
                                    <div key={cmt.id} className={`flex gap-3 ${cmt.user_id === user.id ? 'flex-row-reverse' : ''}`}>
                                        <div className="h-8 w-8 rounded-full overflow-hidden flex-shrink-0 bg-slate-200">
                                             <img src={`https://api.dicebear.com/9.x/notionists/svg?seed=${cmt.user_email}`} alt="Avt" />
                                        </div>
                                        <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${cmt.user_id === user.id ? 'bg-indigo-600 text-white rounded-tr-none' : (darkMode ? 'bg-slate-700 text-slate-200' : 'bg-white text-slate-700 shadow-sm border')}`}>
                                            <p className="font-bold text-[10px] opacity-70 mb-1">{cmt.user_email}</p>
                                            <p>{cmt.content}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Ô NHẬP TIN NHẮN */}
                        <div className={`p-4 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    placeholder="Viết bình luận..." 
                                    className={`flex-1 p-3 rounded-xl outline-none ${darkMode ? 'bg-slate-800 text-white' : 'bg-white border text-slate-800'}`}
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSendComment()}
                                />
                                <button onClick={handleSendComment} className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700">➤</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}