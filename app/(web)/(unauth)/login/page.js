// /app/(web)/(unauth)/login/page.js
import LoginForm from "@/components/login/loginForm";
export const experimental_ppr = true; 

export default function LoginPage() {
  return (
    <main style={{ margin: '20px' }}>
      <LoginForm />
    </main>
  );
}
