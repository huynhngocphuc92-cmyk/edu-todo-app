import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import DashboardClient from './components/DashboardClient';

export default async function DashboardPage() {
  const supabase = await createClient();
  
  // Kiểm tra user từ server
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Nếu chưa đăng nhập, redirect sang /login
  if (!user) {
    redirect('/login');
  }

  // Render DashboardClient với user_id
  return <DashboardClient userId={user.id} />;
}
