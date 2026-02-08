import { AuthProvider } from '@/context/AuthContext';
import { TimelineProvider } from '@/context/TimelineContext';
import { Hero } from '@/sections/Hero';
import { Timeline } from '@/sections/Timeline';
import { Storylines } from '@/sections/Storylines';
import { StoryGraph } from '@/sections/StoryGraph';
import { Footer } from '@/sections/Footer';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <TimelineProvider>
        <div className="min-h-screen bg-[#010101] text-white">
          {/* Grain Overlay */}
          <div className="grain-overlay" />
          
          {/* Main Content */}
          <main>
            <Hero />
            <Timeline />
            <Storylines />
            <StoryGraph />
            <Footer />
          </main>
        </div>
      </TimelineProvider>
    </AuthProvider>
  );
}

export default App;
