'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

// Tính phần trăm progress (dựa trên thời gian giữa start và deadline và time hiện tại)
function calculateProgress(startDate, deadline, completed) {
  if (completed) return 100;
  if (!startDate || !deadline) return 0;
  const start = new Date(startDate);
  const end = new Date(deadline);
  const now = new Date();

  if (now <= start) return 0;
  if (now >= end) return 100;

  const total = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

// Hàm check xem deadline đã quá hạn chưa (và chưa completed)
function isDeadlineOverdue(deadline, completed) {
  if (!deadline || completed) return false;
  const today = new Date();
  const deadlineDate = new Date(deadline);
  // So sánh chỉ theo ngày, bỏ qua giờ/phút/giây
  return deadlineDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

// Circular Progress SVG Component
function CircularProgress({ value, size = 84, strokeWidth = 8, color = '#22c55e', bgColor = '#e5e7eb', children }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, value));
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center">
      <svg width={size} height={size} className="block" style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={bgColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <div
        className="absolute flex items-center justify-center"
        style={{
          left: '0',
          top: '0',
          width: size,
          height: size,
          pointerEvents: 'none',
          position: 'relative',
          marginTop: -size
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  // Sử dụng loading của network
  const [tasks, setTasks] = useState([]);
  const [input, setInput] = useState({
    task: '',
    startDate: '',
    deadline: '',
  });
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingIds, setEditingIds] = useState([]); // Để disable input khi đang cập nhật

  // Hàm tải danh sách tasks từ Supabase, sắp xếp theo created_at giảm dần
  const fetchTasks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) {
      setTasks(data || []);
    }
    setLoading(false);
  };

  // Lấy dữ liệu từ Supabase khi mở web
  useEffect(() => {
    fetchTasks();
    // eslint-disable-next-line
  }, []);

  const handleInputChange = (e) => {
    setInput({ ...input, [e.target.name]: e.target.value });
  };

  // Thêm task mới lên Supabase với mapping đúng tên cột
  const handleAddTask = async (e) => {
    e.preventDefault();
    const { task, startDate, deadline } = input;
    if (!task.trim() || !startDate || !deadline) {
      return;
    }
    setAdding(true);
    const { error } = await supabase.from('tasks').insert([
      {
        title: task.trim(),          // Map biến task vào cột title
        start_date: startDate,       // Map biến startDate vào cột start_date
        deadline: deadline,
        completed: false
      }
    ]);
    setInput({ task: '', startDate: '', deadline: '' });
    setAdding(false);
    fetchTasks();
  };

  // Toggle trạng thái completed
  const handleStatusToggle = async (id, currentStatus) => {
    setEditingIds(ids => [...ids, id]);
    await supabase
      .from('tasks')
      .update({ completed: !currentStatus })
      .eq('id', id);
    setEditingIds(ids => ids.filter(x => x !== id));
    fetchTasks();
  };

  // Sửa nội dung task, hoặc startDate, hoặc deadline
  const handleTaskEdit = async (id, field, value) => {
    // Map lại field phù hợp khi update
    let supaField = field;
    if (field === 'task') supaField = 'title';
    if (field === 'startDate') supaField = 'start_date';
    // deadline giữ nguyên
    setEditingIds(ids => [...ids, id]);
    await supabase
      .from('tasks')
      .update({ [supaField]: value })
      .eq('id', id);
    setEditingIds(ids => ids.filter(x => x !== id));
    fetchTasks();
  };

  // Xóa task khỏi Supabase
  const handleDeleteTask = async (id) => {
    setEditingIds(ids => [...ids, id]);
    await supabase
      .from('tasks')
      .delete()
      .eq('id', id);
    setEditingIds(ids => ids.filter(x => x !== id));
    fetchTasks();
  };

  // --- Dashboard Analytics ---
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.completed).length;
  const doingTasks = tasks.filter((t) => !t.completed).length;
  const completedPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Tính tiến độ tổng thể của tất cả nhiệm vụ
  const overallProgress =
    totalTasks > 0
      ? Math.round(
          tasks.reduce(
            (acc, t) =>
              acc +
              calculateProgress(
                t.start_date,
                t.deadline,
                t.completed
              ),
            0
          ) / totalTasks
        )
      : 0;

  // Chọn màu cho progress
  let progressColor = '';
  if (overallProgress > 80) progressColor = '#22c55e'; // xanh lá
  else if (overallProgress < 50) progressColor = '#f59e42'; // cam
  else progressColor = '#eab308'; // vàng

  let ringTextColor =
    overallProgress > 80
      ? 'text-green-600'
      : overallProgress < 50
      ? 'text-orange-500'
      : 'text-yellow-500';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-10">
      <div className="bg-white shadow-lg rounded-xl p-8 w-full max-w-3xl">
        <h1 className="text-3xl font-bold text-blue-700 mb-8 text-center">
          Quản Lý Nhiệm Vụ Giáo Dục
        </h1>

        {/* ----- DASHBOARD ANALYTICS ----- */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Tổng số nhiệm vụ */}
            <div className="bg-blue-50 p-4 rounded-lg flex flex-col items-center justify-center shadow-sm border border-blue-100">
              <div className="text-xl font-semibold text-blue-700">Tổng nhiệm vụ</div>
              <div className="text-4xl font-bold text-blue-900 mt-2">{totalTasks}</div>
            </div>
            {/* Đã hoàn thành */}
            <div className="bg-green-50 p-4 rounded-lg flex flex-col items-center justify-center shadow-sm border border-green-100">
              <div className="text-xl font-semibold text-green-700">Đã hoàn thành</div>
              <div className="flex flex-row items-baseline mt-2">
                <div className="text-4xl font-bold text-green-900">{completedTasks}</div>
                <div className="ml-1 text-base text-green-700 font-medium">
                  ({completedPercent}%)
                </div>
              </div>
            </div>
            {/* Đang thực hiện */}
            <div className="bg-yellow-50 p-4 rounded-lg flex flex-col items-center justify-center shadow-sm border border-yellow-100">
              <div className="text-xl font-semibold text-yellow-700">Đang thực hiện</div>
              <div className="text-4xl font-bold text-yellow-900 mt-2">{doingTasks}</div>
            </div>
          </div>
          {/* Vòng tròn tiến độ tổng thể */}
          <div className="flex justify-center items-center md:ml-6 mt-4 md:mt-0 min-w-[110px]">
            <div className="relative flex flex-col items-center">
              <CircularProgress value={overallProgress} color={progressColor}>
                <span className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-bold text-xl ${ringTextColor}`}>
                  {overallProgress}%
                </span>
              </CircularProgress>
              <span className="text-xs text-gray-600 mt-1 whitespace-nowrap">
                Tiến độ dự án
              </span>
            </div>
          </div>
        </div>

        {/* Khu vực input thêm mới */}
        <form
          onSubmit={handleAddTask}
          className="mb-8 flex flex-col md:flex-row gap-4 items-stretch md:items-end"
        >
          <div className="flex-1">
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Tên nhiệm vụ
            </label>
            <input
              name="task"
              type="text"
              className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              placeholder="Nhập tên nhiệm vụ..."
              value={input.task}
              onChange={handleInputChange}
              autoComplete="off"
              disabled={adding}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Ngày bắt đầu
            </label>
            <input
              name="startDate"
              type="date"
              className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              value={input.startDate}
              onChange={handleInputChange}
              max={input.deadline || undefined}
              disabled={adding}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Deadline
            </label>
            <input
              name="deadline"
              type="date"
              className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              value={input.deadline}
              onChange={handleInputChange}
              min={input.startDate || undefined}
              disabled={adding}
            />
          </div>
          <div className="flex mt-auto">
            <button
              type="submit"
              className="bg-blue-700 hover:bg-blue-800 transition text-white rounded-lg px-6 py-2 font-semibold flex items-center gap-2 shadow-md"
              disabled={adding}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  d="M12 4v16m8-8H4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                ></path>
              </svg>
              {adding ? 'Đang thêm...' : 'Thêm Nhiệm Vụ'}
            </button>
          </div>
        </form>

        {/* Danh sách nhiệm vụ */}
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate [border-spacing:0.7rem]">
            <thead>
              <tr>
                <th className="text-left font-semibold text-gray-600">Nhiệm vụ</th>
                <th className="text-left font-semibold text-gray-600">Ngày bắt đầu</th>
                <th className="text-left font-semibold text-gray-600">Deadline</th>
                <th className="text-left font-semibold text-gray-600">Tiến độ</th>
                <th className="text-left font-semibold text-gray-600">Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center italic text-gray-400 p-8">
                    Đang tải...
                  </td>
                </tr>
              ) : (
                <>
                  {tasks.map((row) => {
                    const progress = calculateProgress(
                      row.start_date,
                      row.deadline,
                      row.completed
                    );
                    const isOverdue = isDeadlineOverdue(row.deadline, row.completed);
                    const disabled = editingIds.includes(row.id);

                    return (
                      <tr
                        key={row.id}
                        className="align-middle group transition hover:bg-blue-50"
                      >
                        {/* Tên nhiệm vụ */}
                        <td className="py-2 pr-4 w-1/4 min-w-[180px]">
                          <input
                            className={
                              "border rounded-lg px-3 py-2 w-full focus:outline-none focus:border-blue-500 transition " +
                              (row.completed
                                ? 'line-through opacity-60 bg-gray-100 cursor-not-allowed'
                                : 'border-gray-300 bg-white')
                            }
                            type="text"
                            value={row.title}
                            disabled={row.completed || disabled}
                            onChange={(e) =>
                              handleTaskEdit(row.id, 'task', e.target.value)
                            }
                          />
                        </td>
                        {/* Ngày bắt đầu */}
                        <td className="py-2 pr-4 min-w-[110px]">
                          <input
                            className={
                              "border rounded-lg px-3 py-2 w-full focus:outline-none focus:border-blue-500 transition " +
                              (row.completed
                                ? 'line-through opacity-60 bg-gray-100 cursor-not-allowed'
                                : 'border-gray-300 bg-white')
                            }
                            type="date"
                            value={row.start_date}
                            disabled={row.completed || disabled}
                            max={row.deadline || undefined}
                            onChange={(e) =>
                              handleTaskEdit(row.id, 'startDate', e.target.value)
                            }
                          />
                        </td>
                        {/* Deadline */}
                        <td className="py-2 pr-4 min-w-[110px]">
                          <input
                            className={
                              "border rounded-lg px-3 py-2 w-full focus:outline-none focus:border-blue-500 transition " +
                              (row.completed
                                ? 'line-through opacity-60 bg-gray-100 cursor-not-allowed'
                                : 'border-gray-300 bg-white')
                            }
                            type="date"
                            value={row.deadline}
                            disabled={row.completed || disabled}
                            min={row.start_date || undefined}
                            onChange={(e) =>
                              handleTaskEdit(row.id, 'deadline', e.target.value)
                            }
                            style={
                              isOverdue
                                ? { color: '#ef4444', borderColor: '#ef4444', fontWeight: 'bold' }
                                : undefined
                            }
                          />
                          {isOverdue && (
                            <div className="text-xs text-red-500 font-semibold mt-1">
                              Đã quá hạn!
                            </div>
                          )}
                        </td>
                        {/* Tiến độ (progress) */}
                        <td className="py-2 pr-4 min-w-[140px]">
                          <div className="flex items-center gap-2">
                            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                              <div
                                className={
                                  "h-4 rounded-full transition-all duration-300 " +
                                  (progress === 100
                                    ? "bg-green-500"
                                    : progress >= 70
                                    ? "bg-blue-500"
                                    : progress >= 30
                                    ? "bg-yellow-400"
                                    : "bg-red-400")
                                }
                                style={{
                                  width: `${progress}%`,
                                }}
                              ></div>
                            </div>
                            <span className="text-blue-700 font-semibold text-xs w-10 text-right">
                              {progress}%
                            </span>
                          </div>
                        </td>
                        {/* Trạng thái */}
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={row.completed}
                              onChange={() => handleStatusToggle(row.id, row.completed)}
                              className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded transition"
                              id={`status-${row.id}`}
                              disabled={disabled}
                            />
                            <span
                              className={
                                "px-3 py-1 rounded-full text-xs font-bold transition " +
                                (row.completed
                                  ? "bg-green-100 text-green-700 line-through opacity-60"
                                  : "bg-gray-200 text-gray-600")
                              }
                            >
                              {row.completed ? "Đã xong" : "Đang làm"}
                            </span>
                          </div>
                        </td>
                        {/* Icon xóa */}
                        <td className="py-2 text-right min-w-[48px]">
                          <button
                            type="button"
                            onClick={() => handleDeleteTask(row.id)}
                            className="rounded p-2 text-red-600 hover:bg-red-100 transition"
                            tabIndex={-1}
                            title="Xóa nhiệm vụ"
                            disabled={disabled}
                          >
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M6 7h12m-9 0v10m6-10v10M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12m-10 0V5a2 2 0 012-2h2a2 2 0 012 2v2"
                              />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {tasks.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center italic text-gray-400 p-8">
                        Chưa có nhiệm vụ nào.
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
