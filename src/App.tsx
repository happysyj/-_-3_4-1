import React, { useEffect, useRef, useState, useCallback } from 'react';
import { QUIZ_SETS, QuizSet } from './data/quizData';
import { sfx } from './utils/sound';
import { 
  Rocket, 
  HelpCircle, 
  Gift, 
  Trophy, 
  Volume2, 
  VolumeX, 
  Bomb, 
  Clock, 
  Heart, 
  Flame, 
  CheckCircle2, 
  XCircle, 
  RotateCcw, 
  Home, 
  ChevronRight,
  ShieldAlert,
  Info
} from 'lucide-react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  decay: number;
}

interface Asteroid {
  x: number;
  y: number;
  radius: number;
  speed: number;
  hp: number;
  rot: number;
  rotSpeed: number;
}

interface Laser {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
}

interface Star {
  x: number;
  y: number;
  radius: number;
  speed: number;
  alpha: number;
}

// Safe localStorage helpers (prevents DOMException: SecurityError in restricted environments)
const safeGetHighScore = (): number => {
  try {
    const val = localStorage.getItem('nuri_high_score');
    return val ? parseInt(val, 10) || 0 : 0;
  } catch {
    return 0;
  }
};

const safeSetHighScore = (score: number) => {
  try {
    localStorage.setItem('nuri_high_score', score.toString());
  } catch {
    // ignore in restricted mode
  }
};

export default function App() {
  // Game states: 'START' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'>('START');
  const [nickname, setNickname] = useState<string>('우주대원');
  const [score, setScore] = useState<number>(0);
  const [hp, setHp] = useState<number>(100);
  const [bombCount, setBombCount] = useState<number>(3);
  const [timerSeconds, setTimerSeconds] = useState<number>(300); // 5분
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [highScore, setHighScore] = useState<number>(0);

  // Result stats
  const [asteroidsDestroyed, setAsteroidsDestroyed] = useState<number>(0);
  const [quizCorrectCount, setQuizCorrectCount] = useState<number>(0);
  const [isVictory, setIsVictory] = useState<boolean>(false);

  // Modals
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [showReward, setShowReward] = useState<boolean>(false);
  const [isDamageFlashing, setIsDamageFlashing] = useState<boolean>(false);

  // Quiz state & non-duplication management
  const [availableSetIds, setAvailableSetIds] = useState<number[]>([]);
  const [currentQuizSet, setCurrentQuizSet] = useState<QuizSet | null>(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState<number>(0);
  const [currentSetCorrectCount, setCurrentSetCorrectCount] = useState<number>(0);
  const [selectedOptionIdx, setSelectedOptionIdx] = useState<number | null>(null);
  const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState<boolean>(false);
  const [quizRewardMessage, setQuizRewardMessage] = useState<string | null>(null);

  // Canvas & Engine refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Mutable game simulation refs (avoid state lag during 60fps loop)
  const scoreRef = useRef<number>(0);
  const hpRef = useRef<number>(100);
  const bombCountRef = useRef<number>(3);
  const lastScoreMilestoneRef = useRef<number>(0);
  const asteroidsDestroyedRef = useRef<number>(0);
  const quizCorrectCountRef = useRef<number>(0);
  const availableSetIdsRef = useRef<number[]>([]);
  const gameStateRef = useRef<'START' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'>('START');

  // Keep refs synchronized
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);
  useEffect(() => {
    hpRef.current = hp;
  }, [hp]);
  useEffect(() => {
    bombCountRef.current = bombCount;
  }, [bombCount]);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);
  useEffect(() => {
    availableSetIdsRef.current = availableSetIds;
  }, [availableSetIds]);

  // Player ship ref
  const playerRef = useRef({
    x: 0,
    y: 0,
    width: 46,
    height: 52,
    speed: 6.8
  });

  // Entities refs
  const lasersRef = useRef<Laser[]>([]);
  const asteroidsRef = useRef<Asteroid[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const starsRef = useRef<Star[]>([]);

  // Key input tracking
  const keysRef = useRef<{ [key: string]: boolean }>({
    ArrowLeft: false,
    ArrowRight: false,
    ArrowUp: false,
    ArrowDown: false,
    Space: false
  });

  // Load high score
  useEffect(() => {
    setHighScore(safeGetHighScore());
  }, []);

  // Initialize stars
  const initStars = useCallback((width: number, height: number) => {
    const list: Star[] = [];
    for (let i = 0; i < 80; i++) {
      list.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.5 + 0.4,
        speed: Math.random() * 1.3 + 0.3,
        alpha: Math.random() * 0.75 + 0.25
      });
    }
    starsRef.current = list;
  }, []);

  // Resize canvas handler
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    const player = playerRef.current;
    if (player.x === 0 && player.y === 0) {
      player.x = canvas.width / 2 - player.width / 2;
      player.y = canvas.height - player.height - 90;
    } else {
      player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));
      player.y = Math.max(0, Math.min(canvas.height - player.height - 25, player.y));
    }

    if (starsRef.current.length === 0) {
      initStars(canvas.width, canvas.height);
    }
  }, [initStars]);

  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  // Damage Screen Flash
  const triggerDamageFlash = useCallback(() => {
    setIsDamageFlashing(true);
    setTimeout(() => {
      setIsDamageFlashing(false);
    }, 320);
  }, []);

  // Add Score & Milestones
  const addScore = useCallback((amount: number) => {
    const nextScore = scoreRef.current + amount;
    scoreRef.current = nextScore;
    setScore(nextScore);

    // Milestone bonus: 100 points -> +25% HP
    const milestone = Math.floor(nextScore / 100);
    if (milestone > lastScoreMilestoneRef.current) {
      lastScoreMilestoneRef.current = milestone;
      const nextHp = Math.min(100, hpRef.current + 25);
      hpRef.current = nextHp;
      setHp(nextHp);
      sfx.playCorrect();
    }
  }, []);

  // Take Damage
  const takeDamage = useCallback((amount: number) => {
    triggerDamageFlash();
    sfx.playExplosion();
    const nextHp = Math.max(0, hpRef.current - amount);
    hpRef.current = nextHp;
    setHp(nextHp);

    if (nextHp <= 0) {
      handleGameOver(false);
    }
  }, [triggerDamageFlash]);

  // Create Explosion Particles
  const createExplosion = (x: number, y: number, color: string, count = 14) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 1;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: Math.random() * 3 + 1.5,
        color,
        alpha: 1,
        decay: Math.random() * 0.03 + 0.02
      });
    }
  };

  // Shoot Laser
  const shootLaser = useCallback(() => {
    if (gameStateRef.current !== 'PLAYING') return;
    const player = playerRef.current;
    lasersRef.current.push({
      x: player.x + player.width / 2 - 3,
      y: player.y,
      width: 6,
      height: 20,
      speed: 13
    });
    sfx.playLaser();
  }, []);

  // Use Bomb
  const useBomb = useCallback(() => {
    if (gameStateRef.current !== 'PLAYING') return;
    if (bombCountRef.current <= 0) return;

    const nextBombs = bombCountRef.current - 1;
    bombCountRef.current = nextBombs;
    setBombCount(nextBombs);
    sfx.playBomb();

    // Destroy all asteroids on screen
    const list = asteroidsRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const ast = list[i];
      createExplosion(ast.x, ast.y, '#ff4444', 24);
      asteroidsDestroyedRef.current += 1;
      setAsteroidsDestroyed(asteroidsDestroyedRef.current);
      addScore(10);
    }
    asteroidsRef.current = [];
  }, [addScore]);

  // Spawn Asteroid with 20% speed increase
  const spawnAsteroid = (width: number) => {
    const radius = Math.random() * 16 + 18; // Radius 18 ~ 34
    // Base speed: (Math.random() * 2 + 1.5) * 0.6
    // Requirement: "소행성이 다가오는 속도를 20%더 향상시켜줘" -> multiplied by 1.2
    const baseSpeed = (Math.random() * 2 + 1.5) * 0.6;
    const speed = baseSpeed * 1.2;

    asteroidsRef.current.push({
      x: Math.random() * (width - radius * 2) + radius,
      y: -radius,
      radius,
      speed,
      hp: radius > 27 ? 2 : 1,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.04
    });
  };

  // Open Quiz Modal (Guarantee non-overlapping sets in single run)
  const triggerQuizModal = useCallback(() => {
    if (gameStateRef.current !== 'PLAYING') return;

    gameStateRef.current = 'PAUSED';
    setGameState('PAUSED');
    sfx.stopBGM();

    let pool = [...availableSetIdsRef.current];
    // If all 10 sets were already used, refresh the pool so player can continue learning
    if (pool.length === 0) {
      pool = QUIZ_SETS.map(s => s.id);
    }

    // Pick random set from available pool
    const randomIndex = Math.floor(Math.random() * pool.length);
    const selectedId = pool[randomIndex];

    // Remove the chosen set from the available pool to prevent duplicate appearances
    const updatedPool = pool.filter(id => id !== selectedId);
    setAvailableSetIds(updatedPool);
    availableSetIdsRef.current = updatedPool;

    const chosenSet = QUIZ_SETS.find(s => s.id === selectedId) || QUIZ_SETS[0];
    setCurrentQuizSet(chosenSet);
    setCurrentQuestionIdx(0);
    setCurrentSetCorrectCount(0);
    setSelectedOptionIdx(null);
    setHasSubmittedAnswer(false);
    setQuizRewardMessage(null);
  }, []);

  // Game Over handling
  const handleGameOver = useCallback((victory: boolean) => {
    gameStateRef.current = 'GAMEOVER';
    setGameState('GAMEOVER');
    setIsVictory(victory);
    sfx.stopBGM();

    const finalScore = scoreRef.current;
    const stored = safeGetHighScore();
    if (finalScore > stored) {
      safeSetHighScore(finalScore);
      setHighScore(finalScore);
    }
  }, []);

  // Timer interval countdown
  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const interval = setInterval(() => {
      setTimerSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          handleGameOver(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState, handleGameOver]);

  // Keyboard controls listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }

      if (e.code in keysRef.current) {
        keysRef.current[e.code] = true;
      }
      if (e.code === 'Space') {
        shootLaser();
      }
      if (e.code === 'KeyB') {
        useBomb();
      }
      if (e.code === 'KeyQ') {
        triggerQuizModal();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code in keysRef.current) {
        keysRef.current[e.code] = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [shootLaser, useBomb, triggerQuizModal]);

  // Main 60FPS Game Loop
  useEffect(() => {
    let lastTime = performance.now();

    const loop = (timestamp: number) => {
      // Delta time check
      lastTime = timestamp;

      const canvas = canvasRef.current;
      if (canvas && gameStateRef.current === 'PLAYING') {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const width = canvas.width;
          const height = canvas.height;
          const player = playerRef.current;

          // 1. Move Player
          const keys = keysRef.current;
          if (keys.ArrowLeft && player.x > 0) player.x -= player.speed;
          if (keys.ArrowRight && player.x < width - player.width) player.x += player.speed;
          if (keys.ArrowUp && player.y > 0) player.y -= player.speed;
          if (keys.ArrowDown && player.y < height - player.height - 25) player.y += player.speed;

          // 2. Stars
          starsRef.current.forEach(s => {
            s.y += s.speed;
            if (s.y > height) {
              s.y = 0;
              s.x = Math.random() * width;
            }
          });

          // 3. Lasers
          const lasers = lasersRef.current;
          for (let i = lasers.length - 1; i >= 0; i--) {
            const l = lasers[i];
            l.y -= l.speed;
            if (l.y < -l.height) {
              lasers.splice(i, 1);
            }
          }

          // 4. Asteroid Spawning (controlled frequency)
          if (Math.random() < 0.018) {
            spawnAsteroid(width);
          }

          // 5. Asteroids update & collision
          const asteroids = asteroidsRef.current;
          for (let i = asteroids.length - 1; i >= 0; i--) {
            const ast = asteroids[i];
            ast.y += ast.speed;
            ast.rot += ast.rotSpeed;

            // Reached Earth Orbit (Bottom screen)
            if (ast.y - ast.radius > height) {
              asteroids.splice(i, 1);
              takeDamage(15);
              continue;
            }

            // Ship Collision
            const distX = ast.x - (player.x + player.width / 2);
            const distY = ast.y - (player.y + player.height / 2);
            const dist = Math.sqrt(distX * distX + distY * distY);
            if (dist < ast.radius + player.width / 2 - 4) {
              createExplosion(ast.x, ast.y, '#ff4444', 22);
              asteroids.splice(i, 1);
              takeDamage(20);
              continue;
            }

            // Laser Collision
            for (let j = lasers.length - 1; j >= 0; j--) {
              const l = lasers[j];
              if (
                l.x < ast.x + ast.radius &&
                l.x + l.width > ast.x - ast.radius &&
                l.y < ast.y + ast.radius &&
                l.y + l.height > ast.y - ast.radius
              ) {
                lasers.splice(j, 1);
                ast.hp -= 1;
                createExplosion(l.x, l.y, '#ffff00', 6);

                if (ast.hp <= 0) {
                  createExplosion(ast.x, ast.y, '#ff8800', 18);
                  asteroids.splice(i, 1);
                  asteroidsDestroyedRef.current += 1;
                  setAsteroidsDestroyed(asteroidsDestroyedRef.current);
                  sfx.playExplosion();
                  addScore(10);
                  break;
                }
              }
            }
          }

          // 6. Particles update
          const particles = particlesRef.current;
          for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= p.decay;
            if (p.alpha <= 0) {
              particles.splice(i, 1);
            }
          }

          // 7. Render Canvas
          ctx.clearRect(0, 0, width, height);

          // Render Stars
          starsRef.current.forEach(s => {
            ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
            ctx.fill();
          });

          // Render Lasers
          lasers.forEach(l => {
            ctx.fillStyle = '#00f0ff';
            ctx.shadowBlur = 12;
            ctx.shadowColor = '#00f0ff';
            ctx.fillRect(l.x, l.y, l.width, l.height);
            ctx.shadowBlur = 0;
          });

          // Render Asteroids
          asteroids.forEach(ast => {
            ctx.save();
            ctx.translate(ast.x, ast.y);
            ctx.rotate(ast.rot);

            ctx.fillStyle = '#64748b';
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 2.5;

            ctx.beginPath();
            ctx.arc(0, 0, ast.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Craters details
            ctx.fillStyle = '#475569';
            ctx.beginPath();
            ctx.arc(-ast.radius * 0.32, -ast.radius * 0.22, ast.radius * 0.25, 0, Math.PI * 2);
            ctx.arc(ast.radius * 0.22, ast.radius * 0.32, ast.radius * 0.2, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
          });

          // Render Particles
          particles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.alpha);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          });

          // Render Nuri-ho Spaceship
          ctx.save();
          ctx.translate(player.x, player.y);

          // Rocket engine booster flames
          ctx.fillStyle = Math.random() > 0.5 ? '#ff3b00' : '#ffcc00';
          ctx.beginPath();
          ctx.moveTo(player.width * 0.35, player.height);
          ctx.lineTo(player.width * 0.5, player.height + 15 + Math.random() * 9);
          ctx.lineTo(player.width * 0.65, player.height);
          ctx.closePath();
          ctx.fill();

          // Main Shuttle Fuselage (White)
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.moveTo(player.width / 2, 0);
          ctx.lineTo(player.width, player.height * 0.75);
          ctx.lineTo(player.width * 0.8, player.height);
          ctx.lineTo(player.width * 0.2, player.height);
          ctx.lineTo(0, player.height * 0.75);
          ctx.closePath();
          ctx.fill();

          // Korean Taegeuk Wing Accents (Blue & Red)
          ctx.fillStyle = '#0284c7'; // Blue wing
          ctx.fillRect(0, player.height * 0.58, player.width * 0.24, player.height * 0.26);
          ctx.fillStyle = '#e11d48'; // Red wing
          ctx.fillRect(player.width * 0.76, player.height * 0.58, player.width * 0.24, player.height * 0.26);

          // Cockpit Tinted Window
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(player.width / 2, player.height * 0.36, player.width * 0.22, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        }
      }

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [takeDamage, addScore]);

  // Start / Restart Game Session
  const startGame = () => {
    sfx.init();
    const cleanNick = nickname.trim() || '우주대원';
    setNickname(cleanNick);
    setScore(0);
    setHp(100);
    setBombCount(3);
    setTimerSeconds(300);
    setAsteroidsDestroyed(0);
    setQuizCorrectCount(0);

    // Initialize all 10 problem sets for the new session
    const fullSetIds = QUIZ_SETS.map(s => s.id);
    setAvailableSetIds(fullSetIds);
    availableSetIdsRef.current = fullSetIds;

    scoreRef.current = 0;
    hpRef.current = 100;
    bombCountRef.current = 3;
    lastScoreMilestoneRef.current = 0;
    asteroidsDestroyedRef.current = 0;
    quizCorrectCountRef.current = 0;

    lasersRef.current = [];
    asteroidsRef.current = [];
    particlesRef.current = [];

    handleResize();

    setGameState('PLAYING');
    gameStateRef.current = 'PLAYING';

    if (!isMuted) {
      sfx.startBGM();
    }
  };

  const returnToHome = () => {
    sfx.stopBGM();
    setGameState('START');
    gameStateRef.current = 'START';
  };

  // Toggle Mute
  const handleToggleMute = () => {
    const muted = sfx.toggleMute();
    setIsMuted(muted);
    if (!muted && gameState === 'PLAYING') {
      sfx.startBGM();
    }
  };

  // Submit Answer to Current Question
  const handleQuizSubmit = () => {
    if (selectedOptionIdx === null || !currentQuizSet) return;

    const q = currentQuizSet.questions[currentQuestionIdx];
    const isCorrect = selectedOptionIdx === q.correct;
    setHasSubmittedAnswer(true);

    const ptsMap = { 하: 10, 중: 20, 상: 30 };
    const earned = ptsMap[q.level] || 10;

    if (isCorrect) {
      sfx.playCorrect();
      const updatedCount = currentSetCorrectCount + 1;
      setCurrentSetCorrectCount(updatedCount);

      const totalCorrect = quizCorrectCountRef.current + 1;
      quizCorrectCountRef.current = totalCorrect;
      setQuizCorrectCount(totalCorrect);

      addScore(earned);
    } else {
      sfx.playWrong();
    }
  };

  // Proceed to Next Question or Finalize Set Reward
  const handleQuizNext = () => {
    if (!currentQuizSet) return;

    if (currentQuestionIdx < currentQuizSet.questions.length - 1) {
      setCurrentQuestionIdx(prev => prev + 1);
      setSelectedOptionIdx(null);
      setHasSubmittedAnswer(false);
    } else {
      // 3 questions finished: calculate tailored rewards
      let message = `세트 완료! 3문제 중 ${currentSetCorrectCount}문제를 맞히셨습니다.`;
      if (currentSetCorrectCount === 3) {
        const nextHp = Math.min(100, hpRef.current + 25);
        hpRef.current = nextHp;
        setHp(nextHp);

        const nextBombs = bombCountRef.current + 1;
        bombCountRef.current = nextBombs;
        setBombCount(nextBombs);
        message = '🏆 [3문제 올킬!] 에너지 1칸(+25%) 완충 및 필살 폭탄 +1개 획득!';
      } else if (currentSetCorrectCount === 2) {
        const nextBombs = bombCountRef.current + 1;
        bombCountRef.current = nextBombs;
        setBombCount(nextBombs);
        message = '🎁 [2문제 정답!] 필살 폭탄 +1개 획득!';
      } else if (currentSetCorrectCount === 1) {
        const nextHp = Math.min(100, hpRef.current + 25);
        hpRef.current = nextHp;
        setHp(nextHp);
        message = '❤️ [1문제 정답!] 에너지 1칸(+25%) 회복!';
      } else {
        message = '💡 다음 퀴즈에 다시 도전하여 보상을 획득해 보세요!';
      }

      setQuizRewardMessage(message);
    }
  };

  // Close Quiz Modal and resume gameplay
  const closeQuizModal = () => {
    setCurrentQuizSet(null);
    setQuizRewardMessage(null);
    setGameState('PLAYING');
    gameStateRef.current = 'PLAYING';
    if (!isMuted) {
      sfx.startBGM();
    }
  };

  // Format seconds to mm:ss
  const formatTimer = (sec: number) => {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="flex items-center justify-center min-h-screen w-screen bg-[#020205] p-0 m-0 select-none overflow-hidden">
      <div 
        ref={containerRef}
        className="relative w-full h-full max-w-[960px] max-h-screen aspect-[9/16] sm:aspect-auto sm:h-screen flex flex-col justify-between shadow-2xl bg-black overflow-hidden"
      >
        {/* Screen Damage Overlay */}
        <div 
          className={`absolute inset-0 pointer-events-none z-20 ${
            isDamageFlashing ? 'damage-flash' : ''
          }`} 
        />

        {/* ================= 1. START / MAIN MENU SCREEN ================= */}
        {gameState === 'START' && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-between p-5 md:p-8 bg-slate-950/95 backdrop-blur-md text-center overflow-y-auto">
            <div className="w-full flex flex-col items-center mt-2">
              <span className="px-4 py-1.5 bg-cyan-950 text-cyan-300 text-xs md:text-sm font-extrabold rounded-full tracking-wider border border-cyan-400/80 shadow-md">
                중학교 3학년 과학 • 4. 자극과 반응 (1. 감각 기관)
              </span>

              {/* Title Banner */}
              <div className="mt-4 px-6 md:px-10 py-4 md:py-6 bg-slate-900 border-4 border-cyan-400 rounded-3xl shadow-[0_0_35px_rgba(0,240,255,0.7)] inline-block">
                <h1 className="text-2xl md:text-5xl font-black font-arcade text-yellow-300 tracking-wider flex items-center justify-center gap-3 drop-shadow-[0_4px_12px_rgba(0,0,0,1)]">
                  <Rocket className="w-8 h-8 md:w-12 md:h-12 text-cyan-400 animate-bounce" />
                  누리호 소행성 격추 작전
                </h1>
              </div>

              <p className="text-slate-200 text-xs md:text-base mt-3 font-bold bg-slate-900/90 py-2 px-5 rounded-xl border border-slate-700 shadow-md">
                소행성을 격추하고 감각 기관 개념 퀴즈를 풀어 지구를 구하라!
              </p>

              {/* Info Buttons */}
              <div className="flex gap-3 md:gap-4 mt-4 w-full max-w-md">
                <button
                  onClick={() => setShowGuide(true)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 border-2 border-cyan-400/70 rounded-2xl text-cyan-300 font-extrabold text-sm md:text-base flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer"
                >
                  <HelpCircle className="w-5 h-5 text-cyan-400" />
                  게임 안내
                </button>
                <button
                  onClick={() => setShowReward(true)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 border-2 border-amber-400/70 rounded-2xl text-yellow-300 font-extrabold text-sm md:text-base flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer"
                >
                  <Gift className="w-5 h-5 text-yellow-400" />
                  보상 안내
                </button>
              </div>
            </div>

            {/* Middle Config Card */}
            <div className="w-full max-w-md bg-slate-900/90 p-5 rounded-3xl glow-box text-left space-y-4 my-auto">
              <div>
                <label className="block text-xs md:text-sm font-bold text-cyan-300 mb-1.5">
                  우주대원 닉네임
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={10}
                  className="w-full bg-slate-800 text-yellow-300 font-extrabold text-center text-lg md:text-xl py-3 rounded-2xl border-2 border-cyan-500/80 focus:outline-none focus:ring-2 focus:ring-cyan-300 shadow-inner"
                  placeholder="대원 닉네임 입력"
                />
              </div>

              <div className="flex justify-between items-center bg-cyan-950/80 p-4 rounded-2xl border border-cyan-600/60 text-sm">
                <span className="text-cyan-200 font-bold flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-400" /> 역대 최고 점수
                </span>
                <span className="font-arcade text-yellow-300 font-black text-2xl">
                  {highScore} 점
                </span>
              </div>

              <div className="text-center text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                ✨ 감각 기관 10세트 총 30문항 수록 • 한 게임 내 문제 세트 중복 없음!
              </div>
            </div>

            {/* Start Button */}
            <button
              onClick={startGame}
              className="w-full max-w-md py-4 md:py-5 bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-600 hover:from-cyan-300 hover:to-indigo-500 text-slate-950 font-black text-xl md:text-2xl rounded-2xl shadow-xl shadow-cyan-500/40 transform active:scale-95 transition-all mb-2 cursor-pointer flex items-center justify-center gap-3"
            >
              <Rocket className="w-6 h-6 text-slate-950" />
              미션 시작 (MISSION START)
            </button>
          </div>
        )}

        {/* ================= 2. HUD OVERLAY ================= */}
        {gameState !== 'START' && (
          <div className="absolute top-0 left-0 right-0 z-10 p-3 pointer-events-none flex flex-col gap-2.5">
            {/* Top Row: Full-width Energy Bar */}
            <div className="w-full bg-slate-900/95 p-2 md:p-2.5 rounded-2xl border-2 border-slate-700 backdrop-blur-md flex items-center gap-3 shadow-2xl">
              <span className="text-xs md:text-sm font-black text-red-400 tracking-wider flex items-center gap-1.5 shrink-0">
                <Heart className="w-4 h-4 text-red-500 fill-red-500 animate-pulse" />
                에너지
              </span>
              <div className="w-full h-5 md:h-6 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-700 relative">
                <div
                  className="h-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400 rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(52,211,153,0.8)]"
                  style={{ width: `${Math.max(0, Math.min(100, hp))}%` }}
                />
              </div>
              <span className="text-xs md:text-sm font-black text-emerald-300 shrink-0 font-arcade">
                {hp}%
              </span>
            </div>

            {/* Bottom Row: Bomb, Timer, Score, Quiz Button, Audio Toggle */}
            <div className="flex justify-between items-center w-full">
              {/* Bomb Count Badge */}
              <div className="flex items-center gap-1.5 md:gap-2 bg-slate-900/95 px-3 md:px-4 py-2 rounded-2xl border-2 border-amber-500/80 backdrop-blur-md text-xs md:text-sm font-black text-amber-300 shadow-lg">
                <Bomb className="w-5 h-5 text-amber-400" />
                <span>폭탄:</span>
                <span className="font-arcade text-lg md:text-2xl text-yellow-300 font-black">
                  {bombCount}
                </span>
              </div>

              {/* Center: Countdown Timer */}
              <div className="bg-slate-900/95 px-3 md:px-5 py-1.5 md:py-2 rounded-2xl border-2 border-cyan-500/80 backdrop-blur-md text-center shadow-lg flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <div>
                  <div className="text-[10px] text-cyan-300 font-extrabold tracking-wider">
                    남은 시간
                  </div>
                  <div className="font-arcade text-base md:text-2xl font-black text-yellow-300 tracking-wider">
                    {formatTimer(timerSeconds)}
                  </div>
                </div>
              </div>

              {/* Right: Score, Quiz Button & Audio Toggle */}
              <div className="flex items-center gap-2 md:gap-3 pointer-events-auto">
                <button
                  onClick={handleToggleMute}
                  className="p-2 md:p-2.5 bg-slate-900/90 hover:bg-slate-800 border-2 border-slate-700 rounded-2xl text-slate-300 transition-all active:scale-90 cursor-pointer shadow-md"
                  title={isMuted ? "소리 켜기" : "음소거"}
                >
                  {isMuted ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5 text-cyan-400" />}
                </button>

                <div className="bg-slate-900/95 px-3 py-1.5 rounded-2xl border-2 border-slate-700 backdrop-blur-md text-right">
                  <div className="text-[9px] md:text-[10px] text-slate-400 font-extrabold">점수</div>
                  <div className="font-arcade text-sm md:text-xl font-black text-cyan-300">
                    {score}
                  </div>
                </div>

                {/* Challenge Quiz Button */}
                <button
                  onClick={triggerQuizModal}
                  className="btn-pulse bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950 font-black px-3 md:px-5 py-2 md:py-3 rounded-2xl shadow-2xl border-2 border-yellow-100 text-xs md:text-base flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  <span className="text-base md:text-2xl">💡</span>
                  <span className="tracking-wide">도전! (Q)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= 3. GAME CANVAS ================= */}
        <canvas ref={canvasRef} className="block w-full h-full bg-[#05060d]" />

        {/* ================= 4. MOBILE / TABLET TOUCH CONTROLS ================= */}
        {gameState === 'PLAYING' && (
          <div className="absolute bottom-4 left-0 right-0 z-10 px-4 flex justify-between items-end pointer-events-none">
            {/* Virtual Directional D-Pad */}
            <div className="relative w-36 h-36 pointer-events-auto">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md rounded-full border-2 border-slate-700/60 shadow-xl" />
              <button
                onTouchStart={(e) => { e.preventDefault(); keysRef.current.ArrowUp = true; }}
                onTouchEnd={(e) => { e.preventDefault(); keysRef.current.ArrowUp = false; }}
                onMouseDown={() => { keysRef.current.ArrowUp = true; }}
                onMouseUp={() => { keysRef.current.ArrowUp = false; }}
                className="absolute top-1 left-12 w-12 h-12 rounded-full bg-slate-800/80 border border-slate-600 text-white font-black text-lg flex items-center justify-center active:scale-90"
              >
                ▲
              </button>
              <button
                onTouchStart={(e) => { e.preventDefault(); keysRef.current.ArrowDown = true; }}
                onTouchEnd={(e) => { e.preventDefault(); keysRef.current.ArrowDown = false; }}
                onMouseDown={() => { keysRef.current.ArrowDown = true; }}
                onMouseUp={() => { keysRef.current.ArrowDown = false; }}
                className="absolute bottom-1 left-12 w-12 h-12 rounded-full bg-slate-800/80 border border-slate-600 text-white font-black text-lg flex items-center justify-center active:scale-90"
              >
                ▼
              </button>
              <button
                onTouchStart={(e) => { e.preventDefault(); keysRef.current.ArrowLeft = true; }}
                onTouchEnd={(e) => { e.preventDefault(); keysRef.current.ArrowLeft = false; }}
                onMouseDown={() => { keysRef.current.ArrowLeft = true; }}
                onMouseUp={() => { keysRef.current.ArrowLeft = false; }}
                className="absolute left-1 top-12 w-12 h-12 rounded-full bg-slate-800/80 border border-slate-600 text-white font-black text-lg flex items-center justify-center active:scale-90"
              >
                ◀
              </button>
              <button
                onTouchStart={(e) => { e.preventDefault(); keysRef.current.ArrowRight = true; }}
                onTouchEnd={(e) => { e.preventDefault(); keysRef.current.ArrowRight = false; }}
                onMouseDown={() => { keysRef.current.ArrowRight = true; }}
                onMouseUp={() => { keysRef.current.ArrowRight = false; }}
                className="absolute right-1 top-12 w-12 h-12 rounded-full bg-slate-800/80 border border-slate-600 text-white font-black text-lg flex items-center justify-center active:scale-90"
              >
                ▶
              </button>
            </div>

            {/* Action Buttons: Quiz, Bomb, Fire */}
            <div className="flex items-center gap-2.5 pointer-events-auto">
              <button
                onTouchStart={(e) => { e.preventDefault(); triggerQuizModal(); }}
                onClick={triggerQuizModal}
                className="w-16 h-16 rounded-full bg-amber-500/90 border-2 border-amber-300 font-black text-slate-950 flex flex-col items-center justify-center shadow-lg active:scale-90 cursor-pointer"
              >
                <span className="text-xl">💡</span>
                <span className="text-[10px] font-black">QUIZ</span>
              </button>
              <button
                onTouchStart={(e) => { e.preventDefault(); useBomb(); }}
                onClick={useBomb}
                className="w-16 h-16 rounded-full bg-red-600/90 border-2 border-red-400 font-black text-yellow-300 flex flex-col items-center justify-center shadow-lg active:scale-90 cursor-pointer"
              >
                <span className="text-xl">💣</span>
                <span className="text-[10px] font-black">BOMB</span>
              </button>
              <button
                onTouchStart={(e) => { e.preventDefault(); shootLaser(); }}
                onClick={shootLaser}
                className="w-20 h-20 rounded-full bg-gradient-to-tr from-cyan-600 to-blue-500 border-2 border-cyan-300 font-black text-white flex flex-col items-center justify-center shadow-xl shadow-cyan-500/50 active:scale-90 cursor-pointer"
              >
                <Flame className="w-6 h-6 text-yellow-300" />
                <span className="text-xs font-black tracking-wider">FIRE</span>
              </button>
            </div>
          </div>
        )}

        {/* ================= 5. SCIENCE QUIZ MODAL ================= */}
        {gameState === 'PAUSED' && currentQuizSet && (
          <div className="absolute inset-0 z-40 bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-3 md:p-6">
            <div className="w-full max-w-3xl bg-slate-900 border-4 border-yellow-400 rounded-3xl p-5 md:p-8 shadow-2xl text-slate-100 flex flex-col justify-between max-h-[94vh] overflow-y-auto glow-gold">
              {/* Header */}
              <div className="flex justify-between items-center border-b-2 border-slate-700 pb-3 md:pb-4 mb-3 md:mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl md:text-4xl">🧠</span>
                  <div>
                    <h2 className="text-lg md:text-2xl font-black text-yellow-300">
                      감각 기관 개념 검증 퀴즈
                    </h2>
                    <p className="text-xs md:text-sm font-bold text-cyan-300">
                      {currentQuizSet.title}
                    </p>
                  </div>
                </div>

                {/* Level step badges */}
                <div className="flex gap-1.5 md:gap-2">
                  {(['하', '중', '상'] as const).map((lvl, idx) => {
                    const isCurrent = idx === currentQuestionIdx;
                    const isPassed = idx < currentQuestionIdx;
                    return (
                      <span
                        key={lvl}
                        className={`px-2.5 md:px-3 py-1 rounded-full text-[11px] md:text-xs font-black border transition-all ${
                          isCurrent
                            ? 'bg-amber-400 text-slate-950 border-yellow-200 shadow-md scale-105'
                            : isPassed
                            ? 'bg-emerald-600 text-white border-emerald-400'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {idx + 1}단계 [{lvl}]
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Reward result summary if all 3 questions finished */}
              {quizRewardMessage ? (
                <div className="my-auto py-8 text-center space-y-6">
                  <div className="inline-block p-4 bg-amber-500/20 rounded-full border-2 border-yellow-400 animate-bounce">
                    <Trophy className="w-16 h-16 text-yellow-300" />
                  </div>
                  <h3 className="text-2xl md:text-3xl font-black text-yellow-300">
                    세트 학습 완료!
                  </h3>
                  <div className="p-6 bg-slate-950/80 rounded-2xl border-2 border-slate-700 max-w-lg mx-auto">
                    <p className="text-lg md:text-xl font-extrabold text-cyan-200 leading-relaxed">
                      {quizRewardMessage}
                    </p>
                  </div>
                  <button
                    onClick={closeQuizModal}
                    className="w-full max-w-md mx-auto py-4 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-black rounded-2xl text-lg md:text-xl shadow-xl transition-all cursor-pointer"
                  >
                    🚀 우주 전장으로 복귀하기
                  </button>
                </div>
              ) : (
                /* Question & Options Area */
                <div className="my-auto space-y-4 md:space-y-6">
                  {/* Question Box */}
                  <div className="bg-slate-950/90 p-4 md:p-6 rounded-2xl border-2 border-slate-700 break-words shadow-inner">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-3 py-1 rounded-lg text-xs font-black text-slate-950 ${
                        currentQuizSet.questions[currentQuestionIdx].level === '하'
                          ? 'bg-emerald-400'
                          : currentQuizSet.questions[currentQuestionIdx].level === '중'
                          ? 'bg-sky-400'
                          : 'bg-rose-400'
                      }`}>
                        난이도 [{currentQuizSet.questions[currentQuestionIdx].level}] • {currentQuizSet.questions[currentQuestionIdx].type}
                      </span>
                    </div>
                    <p className="text-base md:text-xl leading-relaxed font-extrabold text-white break-words">
                      {currentQuestionIdx + 1}. {currentQuizSet.questions[currentQuestionIdx].text}
                    </p>
                  </div>

                  {/* Choice Options */}
                  <div className="space-y-2.5">
                    {currentQuizSet.questions[currentQuestionIdx].options.map((opt, idx) => {
                      const isSelected = selectedOptionIdx === idx;
                      return (
                        <button
                          key={idx}
                          disabled={hasSubmittedAnswer}
                          onClick={() => setSelectedOptionIdx(idx)}
                          className={`w-full text-left p-3.5 md:p-4 rounded-2xl border-2 font-bold text-sm md:text-lg transition-all break-words cursor-pointer ${
                            isSelected
                              ? 'border-yellow-400 bg-yellow-500/20 text-yellow-200 shadow-md'
                              : 'border-slate-700 bg-slate-800/80 hover:border-cyan-400 text-slate-200'
                          } ${hasSubmittedAnswer ? 'cursor-default opacity-90' : ''}`}
                        >
                          <span className="inline-block w-7 font-black text-cyan-300">{idx + 1})</span>
                          {opt}
                        </button>
                      );
                    })}
                  </div>

                  {/* Feedback Explanation */}
                  {hasSubmittedAnswer && (
                    <div className={`p-4 md:p-5 rounded-2xl border-2 text-sm md:text-base leading-relaxed break-words shadow-lg ${
                      selectedOptionIdx === currentQuizSet.questions[currentQuestionIdx].correct
                        ? 'border-emerald-500 bg-emerald-950/80 text-emerald-200'
                        : 'border-rose-500 bg-rose-950/80 text-rose-200'
                    }`}>
                      <div className="flex items-center gap-2 font-black text-base md:text-lg mb-1">
                        {selectedOptionIdx === currentQuizSet.questions[currentQuestionIdx].correct ? (
                          <>
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            <span>정답입니다! (+{currentQuizSet.questions[currentQuestionIdx].level === '하' ? 10 : currentQuizSet.questions[currentQuestionIdx].level === '중' ? 20 : 30}점)</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-5 h-5 text-rose-400" />
                            <span>아쉽네요! 정답은 {currentQuizSet.questions[currentQuestionIdx].correct + 1}번입니다.</span>
                          </>
                        )}
                      </div>
                      <p className="whitespace-pre-line text-slate-300 text-xs md:text-sm">
                        {currentQuizSet.questions[currentQuestionIdx].explanation}
                      </p>
                    </div>
                  )}

                  {/* Footer Buttons */}
                  <div className="pt-2 border-t border-slate-800">
                    {!hasSubmittedAnswer ? (
                      <button
                        onClick={handleQuizSubmit}
                        disabled={selectedOptionIdx === null}
                        className={`w-full py-3.5 md:py-4 font-black rounded-2xl text-base md:text-lg transition-all shadow-lg ${
                          selectedOptionIdx !== null
                            ? 'bg-yellow-400 hover:bg-yellow-300 text-slate-950 cursor-pointer active:scale-98'
                            : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                        }`}
                      >
                        정답 제출하기
                      </button>
                    ) : (
                      <button
                        onClick={handleQuizNext}
                        className="w-full py-3.5 md:py-4 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-2xl text-base md:text-lg transition-all shadow-lg active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                      >
                        <span>{currentQuestionIdx < 2 ? '다음 단계 문제로' : '퀴즈 결과 및 보상 확인'}</span>
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= 6. GAME OVER / RESULT SCREEN ================= */}
        {gameState === 'GAMEOVER' && (
          <div className="absolute inset-0 z-50 bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-between p-6 text-center overflow-y-auto">
            <div className="mt-4">
              <h1 className={`text-3xl md:text-5xl font-black tracking-wider font-arcade ${
                isVictory ? 'text-yellow-400 glow-gold' : 'text-rose-500 glow-red'
              }`}>
                {isVictory ? '소행성 격추 미션 성공!' : '소행성 격추 미션 실패...'}
              </h1>
              <p className="text-slate-300 text-sm md:text-base mt-2 font-bold">
                {isVictory
                  ? `${nickname} 대원님, 5분 동안 지구를 성공적으로 구하셨습니다!`
                  : `${nickname} 대원님, 누리호 에너지가 소진되었습니다. 다시 도전하세요!`}
              </p>
            </div>

            {/* Score Summary Box */}
            <div className="w-full max-w-md bg-slate-900/95 p-6 rounded-3xl border-2 border-cyan-500/50 text-left space-y-3.5 my-auto shadow-2xl">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-slate-400 text-sm font-bold">우주대원</span>
                <span className="font-extrabold text-cyan-300 text-base">{nickname}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-slate-400 text-sm font-bold">격추한 소행성</span>
                <span className="font-extrabold text-white text-base">
                  {asteroidsDestroyed} 개 (+{asteroidsDestroyed * 10}점)
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-slate-400 text-sm font-bold">맞힌 퀴즈 문항</span>
                <span className="font-extrabold text-yellow-400 text-base">
                  {quizCorrectCount} 문항
                </span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-slate-200 font-extrabold text-base">최종 점수</span>
                <span className="font-arcade font-black text-2xl md:text-3xl text-cyan-300">
                  {score} 점
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3.5 w-full max-w-md mb-2">
              <button
                onClick={returnToHome}
                className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 border-2 border-slate-600 text-cyan-300 font-black text-base rounded-2xl transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                <Home className="w-5 h-5 text-cyan-400" />
                메인 화면으로
              </button>
              <button
                onClick={startGame}
                className="flex-1 py-4 bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-slate-950 font-black text-base rounded-2xl shadow-xl shadow-cyan-500/40 transform active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-5 h-5 text-slate-950" />
                다시 도전하기
              </button>
            </div>
          </div>
        )}

        {/* ================= 7. GUIDE MODAL ================= */}
        {showGuide && (
          <div className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 border-2 border-cyan-400 rounded-3xl p-6 shadow-2xl text-slate-200 space-y-4 text-left">
              <div className="flex justify-between items-center border-b border-slate-700 pb-3">
                <h2 className="text-lg md:text-xl font-black text-cyan-300 flex items-center gap-2">
                  <HelpCircle className="w-6 h-6 text-cyan-400" />
                  게임 조작 및 규칙
                </h2>
                <button
                  onClick={() => setShowGuide(false)}
                  className="text-slate-400 hover:text-white text-xl font-bold p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2.5 text-xs md:text-sm">
                <p className="font-bold text-yellow-300 flex items-center gap-1.5">
                  ⌨️ 키보드 조작법:
                </p>
                <p className="pl-3 text-slate-300">- 기체 이동: 방향키 (▲▼◀▶)</p>
                <p className="pl-3 text-slate-300">- 레이저 발사: 스페이스바 (Space)</p>
                <p className="pl-3 text-slate-300">- 필살 폭탄: B 키</p>
                <p className="pl-3 text-slate-300">- 퀴즈 도전: Q 키</p>

                <p className="font-bold text-yellow-300 mt-2 flex items-center gap-1.5">
                  📱 터치 조작법 (태블릿/크롬북):
                </p>
                <p className="pl-3 text-slate-300">- 좌측 가상 방향키 & 우측 전용 버튼 (FIRE, BOMB, QUIZ)</p>

                <p className="font-bold text-cyan-300 mt-2 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-cyan-400" />
                  작전 규칙:
                </p>
                <p className="pl-3 text-slate-300">- 소행성 1개 격추 당 10점 획득</p>
                <p className="pl-3 text-slate-300">- 소행성 속도가 20% 증가하여 빠르게 돌진합니다!</p>
                <p className="pl-3 text-slate-300">- 소행성과 충돌하거나 지구 궤도(화면 하단) 통과 시 에너지 감소</p>
                <p className="pl-3 text-slate-300">- 5분간 생존하면 지구 방어 미션 성공!</p>
              </div>

              <button
                onClick={() => setShowGuide(false)}
                className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl text-base transition-all cursor-pointer"
              >
                확인하였습니다
              </button>
            </div>
          </div>
        )}

        {/* ================= 8. REWARD MODAL ================= */}
        {showReward && (
          <div className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 border-2 border-amber-400 rounded-3xl p-6 shadow-2xl text-slate-200 space-y-4 text-left">
              <div className="flex justify-between items-center border-b border-slate-700 pb-3">
                <h2 className="text-lg md:text-xl font-black text-yellow-300 flex items-center gap-2">
                  <Gift className="w-6 h-6 text-yellow-400" />
                  보상 및 퀴즈 시스템
                </h2>
                <button
                  onClick={() => setShowReward(false)}
                  className="text-slate-400 hover:text-white text-xl font-bold p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2.5 text-xs md:text-sm">
                <p className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-amber-400" /> 점수 누적 보상:
                </p>
                <p className="pl-3 text-slate-300">
                  - 누적 점수 100점마다 <span className="text-emerald-400 font-bold">에너지 1칸 (+25%) 자동 회복</span>
                </p>

                <p className="font-bold text-amber-300 mt-2 flex items-center gap-1.5">
                  <Gift className="w-4 h-4 text-amber-400" /> 퀴즈 맞춤형 보상 (3단계 세트 완료 시):
                </p>
                <p className="pl-3 text-slate-300">
                  - <span className="text-yellow-300 font-bold">3문제 올킬</span>: 에너지 1칸(25%) 회복 + 폭탄 1개 충전
                </p>
                <p className="pl-3 text-slate-300">
                  - <span className="text-cyan-300 font-bold">2문제 정답</span>: 폭탄 1개 충전
                </p>
                <p className="pl-3 text-slate-300">
                  - <span className="text-emerald-300 font-bold">1문제 정답</span>: 에너지 1칸(25%) 회복
                </p>

                <p className="font-bold text-amber-300 mt-2 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-amber-400" /> 퀴즈 단계별 득점:
                </p>
                <p className="pl-3 text-slate-300">
                  - [하] 10점 / [중] 20점 / [상] 30점 즉시 추가 획득!
                </p>
                <p className="pl-3 text-slate-300">
                  - 한 번의 플레이 중 출제된 세트는 중복해서 나오지 않습니다.
                </p>
              </div>

              <button
                onClick={() => setShowReward(false)}
                className="w-full py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-base transition-all cursor-pointer"
              >
                확인하였습니다
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
