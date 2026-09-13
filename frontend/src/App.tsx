import { useAuth } from './hooks/useAuth';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { Spinner } from './components/Spinner';

function App() {
  const { isAuthenticated, initializing } = useAuth();

  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <Spinner size={28} label="Loading..." />
      </div>
    );
  }

  return isAuthenticated ? <Dashboard /> : <Auth />;
}

export default App;
