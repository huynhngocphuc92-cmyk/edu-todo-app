'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

export default function DashboardPage() {
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [isBrowser, setIsBrowser] = useState(false);

  // --- DARK MODE STATE ---
  const [darkMode, setDarkMode] = useState(false);

  // --- MODAL STATES ---
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

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
        .order('created_at', { ascending: false });
        
      if (todos) {
        const normalizedTasks = todos.map(t => ({
            ...t,
            status: t.status || 'todo' 
        }));
        setTasks(normalizedTasks);
      }
      setLoading(false);
    };
    getUserAndTasks();
  }, [router, supabase]);

  // --- 2. REAL-TIME ---
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('realtime tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        if (payload.eventType === 'INSERT') {
            const newItem = { ...payload.new, status: payload.new.status || 'todo' };
            setTasks((prev) => [newItem, ...prev]);
        }
        if (payload.eventType === 'DELETE') {
            setTasks((prev) => prev.filter((t) => t.id !== payload.old.id));
        }
        if (payload.eventType === 'UPDATE') {
            setTasks((prev) => prev.map((t) => t.id === payload.new.id ? payload.new : t));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, user]);

  // --- 3. DRAG & DROP ---
  const onDragEnd = async (result) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const newStatus = destination.droppableId;
    const updatedTasks = tasks.map(t => t.id === draggableId ? { ...t, status: newStatus } : t);
    setTasks(updatedTasks);
    await supabase.from('tasks').update({ status: newStatus }).eq('id', draggableId);
  };

  // --- 4. CRUD ACTIONS ---
  const addTodo = async () => {
    if (!newTask || !user) return;
    const { error } = await supabase.from('tasks').insert([{
        title: newTask,
        start_date: startDate,
        deadline: deadline,
        status: 'todo',
        user_id: user.id
    }]);
    if (!error) { setNewTask(''); setStartDate(''); setDeadline(''); }
  };

  const handleDeleteClick = (id) => { setTaskToDelete(id); setIsDeleteModalOpen(true); };
  const confirmDelete = async () => {
      if (taskToDelete) {
        await supabase.from('tasks').delete().match({ id: taskToDelete });
        setIsDeleteModalOpen(false); setTaskToDelete(null);
      }
  };

  const handleEditClick = (task) => { setEditingTask(task); setIsEditModalOpen(true); };
  const saveEdit = async () => {
      if (editingTask) {
          const { error } = await supabase.from('tasks').update({
              title: editingTask.title,
              start_date: editingTask.start_date,
              deadline: editingTask.deadline
          }).eq('id', editingTask.id);
          if (!error) { setIsEditModalOpen(false); setEditingTask(null); }
      }
  };

  // --- HELPER CLASSES FOR DARK MODE ---
  const bgMain = darkMode ? 'bg-slate-900' : 'bg-slate-50';
  const textMain = darkMode ? 'text-slate-100' : 'text-slate-800';
  const bgCard = darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100';
  const bgInput = darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-800';
  const textSub = darkMode ? 'text-slate-400' : 'text-slate-500';

  // --- UI RENDER ---
  if (loading || !isBrowser) return <div className="h-screen flex items-center justify-center bg-slate-900 text-white">Đang tải...</div>;

  const columns = {
    todo: { title: 'Cần làm', bg: darkMode ? 'bg-slate-800/50' : 'bg-slate-100/50', items: tasks.filter(t => t.status === 'todo') },
    in_progress: { title: 'Đang làm', bg: darkMode ? 'bg-yellow-900/20' : 'bg-yellow-50/50', items: tasks.filter(t => t.status === 'in_progress') },
    done: { title: 'Đã xong', bg: darkMode ? 'bg-green-900/20' : 'bg-green-50/50', items: tasks.filter(t => t.status === 'done') }
  };

  return (
    <div className={`min-h-screen py-8 px-4 font-sans transition-colors duration-300 ${bgMain} ${textMain}`}>
      <div className="max-w-6xl mx-auto">
        
        {/* HEADER */}
        <div className={`flex justify-between items-center mb-8 p-5 rounded-2xl shadow-sm border ${bgCard}`}>
            <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-full border-2 border-indigo-500/30 overflow-hidden p-0.5">
                    <img src={`https://api.dicebear.com/9.x/notionists/svg?seed=${user?.email}`} alt="Avatar" className="h-full w-full object-cover rounded-full bg-slate-200" />
                </div>
                <div>
                    <h1 className="text-2xl font-extrabold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">Education Manager</h1>
                    <p className={`text-sm font-medium ${textSub}`}>✨ {user?.email}</p>
                </div>
            </div>
            
            <div className="flex items-center gap-3">
                {/* NÚT DARK MODE */}
                <button 
                    onClick={() => setDarkMode(!darkMode)}
                    className={`p-2.5 rounded-xl transition-all ${darkMode ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                    {darkMode ? '☀️' : '🌙'}
                </button>

                <button 
                    onClick={async () => { await supabase.auth.signOut(); router.push('/login'); }}
                    className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${darkMode ? 'bg-slate-700 hover:bg-red-900/30 text-slate-300 hover:text-red-400' : 'bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600'}`}
                >
                    Đăng xuất
                </button>
            </div>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className={`p-5 rounded-2xl shadow-sm border flex justify-between items-center ${bgCard}`}>
                <div><p className={`text-xs font-bold uppercase tracking-wider ${textSub}`}>Tổng nhiệm vụ</p><p className="text-3xl font-extrabold mt-1">{tasks.length}</p></div>
                <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold ${darkMode ? 'bg-indigo-900/50 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>∑</div>
            </div>
            <div className={`p-5 rounded-2xl shadow-sm border flex justify-between items-center ${bgCard}`}>
                <div><p className={`text-xs font-bold uppercase tracking-wider ${textSub}`}>Đang làm</p><p className="text-3xl font-extrabold text-yellow-500 mt-1">{tasks.filter(t => t.status === 'in_progress').length}</p></div>
                <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold ${darkMode ? 'bg-yellow-900/30 text-yellow-500' : 'bg-yellow-50 text-yellow-600'}`}>⚡</div>
            </div>
            <div className={`p-5 rounded-2xl shadow-sm border flex justify-between items-center ${bgCard}`}>
                <div><p className={`text-xs font-bold uppercase tracking-wider ${textSub}`}>Đã xong</p><p className="text-3xl font-extrabold text-green-500 mt-1">{tasks.filter(t => t.status === 'done').length}</p></div>
                <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold ${darkMode ? 'bg-green-900/30 text-green-500' : 'bg-green-50 text-green-600'}`}>✓</div>
            </div>
        </div>

        {/* INPUT FORM */}
        <div className={`p-2 rounded-2xl shadow-lg border mb-8 flex flex-col md:flex-row gap-2 ${bgCard} ${darkMode ? 'border-indigo-900/50 shadow-indigo-900/20' : 'border-indigo-50'}`}>
            <input type="text" placeholder="✨ Nhập nhiệm vụ mới..." className={`flex-1 p-3 bg-transparent outline-none text-lg font-medium pl-4 placeholder:text-slate-400 ${darkMode ? 'text-white' : 'text-slate-800'}`} value={newTask} onChange={(e) => setNewTask(e.target.value)} />
            <div className="flex gap-2 p-1">
                <input type="date" className={`p-2 rounded-xl border-none outline-none text-sm font-medium cursor-pointer transition ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <input type="date" className={`p-2 rounded-xl border-none outline-none text-sm font-medium cursor-pointer transition ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                <button onClick={addTodo} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 rounded-xl font-bold transition shadow-md active:scale-95">+</button>
            </div>
        </div>

        {/* KANBAN */}
        <DragDropContext onDragEnd={onDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Object.entries(columns).map(([columnId, column]) => (
                    <div key={columnId} className={`p-4 rounded-2xl ${column.bg} min-h-[500px] flex flex-col transition-colors`}>
                        <div className="flex justify-between items-center mb-4 px-2">
                            <h2 className={`font-bold ${columnId === 'todo' ? (darkMode ? 'text-slate-300' : 'text-slate-700') : columnId === 'in_progress' ? 'text-yellow-600' : 'text-green-600'}`}>{column.title}</h2>
                            <span className={`px-2 py-1 rounded-lg text-xs font-bold shadow-sm ${bgCard} ${textSub}`}>{column.items.length}</span>
                        </div>
                        <Droppable droppableId={columnId}>
                            {(provided) => (
                                <div {...provided.droppableProps} ref={provided.innerRef} className="flex-1 space-y-3">
                                    {column.items.map((task, index) => (
                                        <Draggable key={task.id} draggableId={task.id} index={index}>
                                            {(provided) => (
                                                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className={`p-4 rounded-xl shadow-sm border hover:shadow-md transition-all group relative cursor-grab active:cursor-grabbing ${bgCard}`}>
                                                    <h3 className={`font-semibold mb-2 leading-tight ${textMain}`}>{task.title}</h3>
                                                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide">
                                                        {task.start_date && <span className={`px-2 py-1 rounded ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-50 text-slate-400'}`}>Start: {task.start_date}</span>}
                                                        {task.deadline && <span className={`px-2 py-1 rounded ${darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-500'}`}>Due: {task.deadline}</span>}
                                                    </div>
                                                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={(e) => { e.stopPropagation(); handleEditClick(task); }} className={`p-1.5 rounded-lg ${darkMode ? 'text-slate-500 hover:bg-blue-900/30 hover:text-blue-400' : 'text-slate-400 hover:bg-blue-50 hover:text-blue-600'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>
                                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(task.id); }} className={`p-1.5 rounded-lg ${darkMode ? 'text-slate-500 hover:bg-red-900/30 hover:text-red-400' : 'text-slate-400 hover:bg-red-50 hover:text-red-600'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
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

      </div>

      {/* POPUP XÓA */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
                <div className="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></div>
                <h3 className={`text-lg font-bold mb-1 ${textMain}`}>Xóa nhiệm vụ?</h3>
                <p className={`text-sm mb-6 ${textSub}`}>Bạn có chắc muốn xóa không?</p>
                <div className="flex gap-3"><button onClick={() => setIsDeleteModalOpen(false)} className={`flex-1 py-2 rounded-xl font-bold ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>Hủy</button><button onClick={confirmDelete} className="flex-1 py-2 bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-200">Xóa luôn</button></div>
            </div>
        </div>
      )}

      {/* POPUP SỬA */}
      {isEditModalOpen && editingTask && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200 ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
                <h3 className={`text-lg font-bold mb-4 ${textMain}`}>✏️ Chỉnh sửa</h3>
                <div className="space-y-4">
                    <input type="text" className={`w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 ${bgInput}`} value={editingTask.title} onChange={(e) => setEditingTask({...editingTask, title: e.target.value})} />
                    <div className="flex gap-3">
                        <input type="date" className={`flex-1 p-3 border rounded-xl outline-none ${bgInput}`} value={editingTask.start_date || ''} onChange={(e) => setEditingTask({...editingTask, start_date: e.target.value})} />
                        <input type="date" className={`flex-1 p-3 border rounded-xl outline-none ${bgInput}`} value={editingTask.deadline || ''} onChange={(e) => setEditingTask({...editingTask, deadline: e.target.value})} />
                    </div>
                </div>
                <div className="flex gap-3 w-full mt-6"><button onClick={() => setIsEditModalOpen(false)} className={`flex-1 py-2 font-bold rounded-xl ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>Hủy</button><button onClick={saveEdit} className="flex-1 py-2 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200">Lưu</button></div>
            </div>
        </div>
      )}
    </div>
  );
}