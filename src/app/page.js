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

  // --- STATE CHO POPUP XÓA ---
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState(null);

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

  // --- 3. LOGIC KÉO THẢ ---
  const onDragEnd = async (result) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;

    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    // Optimistic Update
    const newStatus = destination.droppableId;
    const updatedTasks = tasks.map(t => 
        t.id === draggableId ? { ...t, status: newStatus } : t
    );
    setTasks(updatedTasks);

    // Update DB
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

  // --- LOGIC XÓA (CÓ CONFIRM) ---
  const handleDeleteClick = (id) => {
      setTaskToDelete(id);
      setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
      if (taskToDelete) {
        await supabase.from('tasks').delete().match({ id: taskToDelete });
        setIsDeleteModalOpen(false);
        setTaskToDelete(null);
      }
  };

  const cancelDelete = () => {
      setIsDeleteModalOpen(false);
      setTaskToDelete(null);
  };

  // --- 5. RENDER UI ---
  if (loading || !isBrowser) return <div className="h-screen flex items-center justify-center">Đang tải...</div>;

  const columns = {
    todo: { title: 'Cần làm', bg: 'bg-blue-50', items: tasks.filter(t => t.status === 'todo') },
    in_progress: { title: 'Đang làm', bg: 'bg-yellow-50', items: tasks.filter(t => t.status === 'in_progress') },
    done: { title: 'Đã xong', bg: 'bg-green-50', items: tasks.filter(t => t.status === 'done') }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 font-sans text-slate-800">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-8 bg-white p-5 rounded-xl shadow-sm">
            <div>
                <h1 className="text-2xl font-bold text-indigo-600">Education Task Manager</h1>
                <p className="text-slate-500 text-sm">Xin chào, {user?.email}</p>
            </div>
            <button onClick={async () => { await supabase.auth.signOut(); router.push('/login'); }} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded text-sm text-slate-600">Đăng xuất</button>
        </div>

        {/* --- ĐÃ KHÔI PHỤC PHẦN THỐNG KÊ Ở ĐÂY --- */}
        <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white p-4 rounded-xl shadow-sm flex justify-between items-center border-l-4 border-blue-500">
                <div><p className="text-xs text-slate-500 uppercase">Tổng nhiệm vụ</p><p className="text-2xl font-bold">{tasks.length}</p></div>
                <div className="h-8 w-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">∑</div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm flex justify-between items-center border-l-4 border-yellow-500">
                <div><p className="text-xs text-slate-500 uppercase">Đang làm</p><p className="text-2xl font-bold text-yellow-600">{tasks.filter(t => t.status === 'in_progress').length}</p></div>
                <div className="h-8 w-8 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center">⚡</div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm flex justify-between items-center border-l-4 border-green-500">
                <div><p className="text-xs text-slate-500 uppercase">Đã xong</p><p className="text-2xl font-bold text-green-600">{tasks.filter(t => t.status === 'done').length}</p></div>
                <div className="h-8 w-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center">✓</div>
            </div>
        </div>

        {/* Form thêm mới */}
        <div className="bg-white p-4 rounded-xl shadow-sm mb-8 border border-indigo-100">
             <div className="flex flex-col md:flex-row gap-3">
                <input type="text" placeholder="✨ Thêm nhiệm vụ mới..." className="flex-1 p-2 bg-slate-50 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={newTask} onChange={(e) => setNewTask(e.target.value)} />
                <input type="date" className="p-2 bg-slate-50 border rounded-lg text-slate-600" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <input type="date" className="p-2 bg-slate-50 border rounded-lg text-slate-600" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                <button onClick={addTodo} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-bold shadow-md transition">+</button>
             </div>
        </div>

        {/* KANBAN BOARD */}
        <DragDropContext onDragEnd={onDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Object.entries(columns).map(([columnId, column]) => (
                    <div key={columnId} className={`${column.bg} p-4 rounded-xl border border-slate-200 min-h-[500px] flex flex-col`}>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="font-bold text-slate-700">{column.title}</h2>
                            <span className="bg-white px-2 py-0.5 rounded-full text-xs font-bold text-slate-500 shadow-sm">{column.items.length}</span>
                        </div>
                        <Droppable droppableId={columnId}>
                            {(provided) => (
                                <div {...provided.droppableProps} ref={provided.innerRef} className="flex-1 space-y-3">
                                    {column.items.map((task, index) => (
                                        <Draggable key={task.id} draggableId={task.id} index={index}>
                                            {(provided) => (
                                                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className="bg-white p-4 rounded-lg shadow-sm border border-slate-100 hover:shadow-md transition-shadow group relative">
                                                    <h3 className="font-semibold text-slate-800 mb-2">{task.title}</h3>
                                                    <div className="flex flex-col gap-1 text-xs text-slate-500">
                                                        {task.start_date && <div className="flex items-center gap-1">📅 {task.start_date}</div>}
                                                        {task.deadline && <div className="flex items-center gap-1 text-orange-600 font-medium">🚩 {task.deadline}</div>}
                                                    </div>
                                                    
                                                    {/* Nút Xóa */}
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteClick(task.id);
                                                        }}
                                                        className="absolute top-2 right-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
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

      {/* MODAL POPUP */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200">
                <div className="flex flex-col items-center text-center">
                    <div className="h-12 w-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">Xác nhận xóa?</h3>
                    <p className="text-slate-500 mb-6 text-sm">Hành động này không thể hoàn tác.</p>
                    <div className="flex gap-3 w-full">
                        <button onClick={cancelDelete} className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition">Hủy bỏ</button>
                        <button onClick={confirmDelete} className="flex-1 px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition shadow-md">Đồng ý xóa</button>
                    </div>
                </div>
            </div>
        </div>
      )}

    </div>
  );
}