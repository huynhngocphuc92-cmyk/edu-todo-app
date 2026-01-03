'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  const supabase = createClient();
  const router = useRouter();

  // --- LOGIC (GIỮ NGUYÊN KHÔNG ĐỔI) ---
  useEffect(() => {
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
      if (todos) setTasks(todos);
      setLoading(false);
    };
    getUserAndTasks();
  }, [router, supabase]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('realtime tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        if (payload.eventType === 'INSERT') setTasks((prev) => [payload.new, ...prev]);
        if (payload.eventType === 'DELETE') setTasks((prev) => prev.filter((t) => t.id !== payload.old.id));
        if (payload.eventType === 'UPDATE') setTasks((prev) => prev.map((t) => t.id === payload.new.id ? payload.new : t));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, user]);

  const addTodo = async () => {
    if (!newTask || !user) return;
    const { error } = await supabase.from('tasks').insert([{
        title: newTask,
        start_date: startDate,
        deadline: deadline,
        completed: false,
        user_id: user.id
    }]);
    if (!error) { setNewTask(''); setStartDate(''); setDeadline(''); }
  };

  const deleteTodo = async (id) => { await supabase.from('tasks').delete().match({ id }); };
  const toggleTodo = async (id, isCompleted) => { await supabase.from('tasks').update({ completed: !isCompleted }).match({ id }); };

  // --- GIAO DIỆN MỚI (MODERN UI) ---
  if (loading) return (
    <div className="flex justify-center items-center h-screen bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 font-sans text-slate-800">
      <div className="max-w-5xl mx-auto">
        
        {/* HEADER */}
        <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div>
                <h1 className="text-3xl font-extrabold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                    Education Task Manager
                </h1>
                <p className="text-slate-500 mt-1 text-sm">Xin chào, {user?.email}</p>
            </div>
            <button 
                onClick={async () => { await supabase.auth.signOut(); router.push('/login'); }}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
                Đăng xuất
            </button>
        </div>

        {/* THỐNG KÊ (STATS CARDS) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between hover:shadow-md transition-shadow">
            <div>
                <p className="text-slate-500 text-sm font-medium">Tổng nhiệm vụ</p>
                <p className="text-3xl font-bold text-slate-800 mt-1">{tasks.length}</p>
            </div>
            <div className="h-12 w-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold text-xl">∑</div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between hover:shadow-md transition-shadow">
            <div>
                <p className="text-slate-500 text-sm font-medium">Đã hoàn thành</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{tasks.filter(t => t.completed).length}</p>
            </div>
            <div className="h-12 w-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center font-bold text-xl">✓</div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between hover:shadow-md transition-shadow">
            <div>
                <p className="text-slate-500 text-sm font-medium">Đang thực hiện</p>
                <p className="text-3xl font-bold text-orange-500 mt-1">{tasks.filter(t => !t.completed).length}</p>
            </div>
            <div className="h-12 w-12 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center font-bold text-xl">⚡</div>
          </div>
        </div>

        {/* FORM NHẬP LIỆU */}
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-indigo-50 mb-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-violet-500"></div>
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            ✨ Thêm nhiệm vụ mới
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-5">
              <input
                type="text"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all placeholder:text-slate-400"
                placeholder="Ví dụ: Học Next.js Chapter 3..."
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
              />
            </div>
            <div className="md:col-span-3">
              <input
                type="date"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-600"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="md:col-span-3">
              <input
                type="date"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-600"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
            <div className="md:col-span-1">
              <button
                onClick={addTodo}
                className="w-full h-full bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition shadow-md flex items-center justify-center text-2xl font-bold pb-1 active:scale-95"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* DANH SÁCH NHIỆM VỤ */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider pl-6">Trạng thái</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-1/3">Tên Nhiệm vụ</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Thời gian</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Tiến độ</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right pr-6">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tasks.length === 0 ? (
                   <tr><td colSpan="5" className="text-center py-12 text-slate-400 italic">Chưa có nhiệm vụ nào. Hãy thêm mới ngay! 🚀</td></tr>
                ) : (
                  tasks.map((todo) => (
                      <tr key={todo.id} className={`group transition-all hover:bg-indigo-50/30 ${todo.completed ? 'bg-slate-50' : ''}`}>
                      <td className="p-4 align-middle pl-6">
                          <label className="relative flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={todo.completed}
                              onChange={() => toggleTodo(todo.id, todo.completed)}
                              className="peer h-6 w-6 cursor-pointer appearance-none rounded-lg border-2 border-slate-300 transition-all checked:border-green-500 checked:bg-green-500 hover:border-indigo-400"
                            />
                             <span className="absolute text-white opacity-0 peer-checked:opacity-100 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none text-sm font-bold">✓</span>
                          </label>
                      </td>
                      <td className="p-4 align-middle">
                          <span className={`font-medium text-base block transition-all ${todo.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                            {todo.title}
                          </span>
                      </td>
                      <td className="p-4 align-middle">
                          <div className="flex flex-col gap-1.5">
                              <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md w-fit border border-slate-200">
                                📅 {todo.start_date || '--'}
                              </span>
                              <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2.5 py-1 rounded-md w-fit border border-orange-100">
                                🏁 {todo.deadline || '--'}
                              </span>
                          </div>
                      </td>
                      <td className="p-4 align-middle w-1/4">
                          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                              <div
                                className={`h-2.5 rounded-full transition-all duration-700 ease-out ${todo.completed ? 'bg-green-500' : 'bg-indigo-500'}`}
                                style={{ width: todo.completed ? '100%' : '15%' }}
                              ></div>
                          </div>
                          <p className="text-[10px] text-right mt-1 text-slate-400 font-medium">
                            {todo.completed ? 'Hoàn thành' : 'Đang chạy'}
                          </p>
                      </td>
                      <td className="p-4 align-middle text-right pr-6">
                          <button 
                              onClick={() => deleteTodo(todo.id)}
                              className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-all transform hover:scale-110"
                              title="Xóa nhiệm vụ"
                          >
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                          </button>
                      </td>
                      </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}