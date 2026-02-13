import { AuthProvider } from '@/context/AuthContext';
import { Hero } from '@/sections/Hero';
import { ProjectStudio } from '@/sections/ProjectStudio';
import { Footer } from '@/sections/Footer';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-[#010101] text-white">
        <div className="grain-overlay" />
        <main>
          <Hero />
          <ProjectStudio />
          <Footer />
        </main>
      </div>
    </AuthProvider>
  );
}

export default App;
