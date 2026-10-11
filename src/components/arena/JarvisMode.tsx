import React, { useEffect, useRef, useState, useCallback, Component, ErrorInfo, ReactNode } from 'react';
import { ResearchState, DiscoveredSource } from '../../types/research';
import { ResearchGraph } from '../graph/ResearchGraph';
import { ActivityFeed } from './ActivityFeed';
import { 
  ShieldCheck, 
  Crosshair, 
  X, 
  PenTool, 
  Eraser, 
  Download, 
  RotateCcw, 
  Monitor, 
  Grab, 
  Globe, 
  ExternalLink, 
  Trash2, 
  Sparkles,
  Cpu,
  Move,
  AlertTriangle
} from 'lucide-react';
// @ts-ignore
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import html2canvas from 'html2canvas';

interface JarvisModeProps {
  state: ResearchState;
  onExit: () => void;
  onSelectItem: (item: any) => void;
}

type GestureState = 'IDLE' | 'HOVER' | 'DRAWING' | 'GRABBING' | 'DROPPING';
type Tool = 'pointer' | 'marker' | 'eraser';
type JarvisVoiceStatus = 'idle' | 'activating' | 'online' | 'ready' | 'unavailable' | 'playing';
type ArenaTab = 'sources' | 'feed' | 'graph';

interface NormalizedPoint {
  x: number; // 0..1 relative to workspace width
  y: number; // 0..1 relative to workspace height
}

interface Stroke {
  id: string;
  points: NormalizedPoint[];
  color: string;
  width: number;
  isEraser: boolean;
}

interface PlacedCard {
  id: string;
  source: DiscoveredSource;
  nx: number; // 0..1 relative to workspace width
  ny: number; // 0..1 relative to workspace height
}

const DEFAULT_SOURCES: DiscoveredSource[] = [
  {
    id: 'src-nirf-gov',
    url: 'https://www.nirfindia.org/2024/EngineeringRanking.html',
    domain: 'nirfindia.org',
    title: 'National Institutional Ranking Framework (NIRF) - Ministry of Education Engineering Placement Audit',
    discoveredBy: 'investigator',
    authority: 'OFFICIAL_GOV',
    retrievedAt: new Date().toISOString(),
    publishedDate: '2024-08-12',
    snippet: 'Statutory audited placement metric submissions for premier technical institutions including median salary, graduating student strength, and verified placements.',
    scrapedSuccessfully: true,
    wordCount: 1840,
  },
  {
    id: 'src-iitb-annual',
    url: 'https://placement.iitb.ac.in/annual-report',
    domain: 'iitb.ac.in',
    title: 'IIT Bombay Placement Cell - Official Annual Placement Report',
    discoveredBy: 'explorer',
    authority: 'PRIMARY_COMPANY',
    retrievedAt: new Date().toISOString(),
    publishedDate: '2024-07-20',
    snippet: 'Official audited placement statistics: 82.5% placed, average CTC ₹21.82 LPA, median package ₹16.64 LPA across B.Tech and M.Tech graduating cohorts.',
    scrapedSuccessfully: true,
    wordCount: 2420,
  },
  {
    id: 'src-cea-standards',
    url: 'https://cea.nic.in/ev-charging-guidelines',
    domain: 'cea.nic.in',
    title: 'Central Electricity Authority - Public EV Charging Grid Standards',
    discoveredBy: 'investigator',
    authority: 'OFFICIAL_GOV',
    retrievedAt: new Date().toISOString(),
    publishedDate: '2024-06-15',
    snippet: 'Mandatory technical standards for public charging stations, tariff schedules, and safety protocols for commercial rapid-charger installations.',
    scrapedSuccessfully: true,
    wordCount: 1950,
  },
  {
    id: 'src-mca-roc',
    url: 'https://www.mca.gov.in/ministry/roc',
    domain: 'mca.gov.in',
    title: 'Ministry of Corporate Affairs - Audited Statutory Financial Returns',
    discoveredBy: 'arbiter',
    authority: 'OFFICIAL_GOV',
    retrievedAt: new Date().toISOString(),
    publishedDate: '2024-05-30',
    snippet: 'Statutory corporate registry filings, audited revenue, EBITDA disclosures, and shareholding patterns for verified domestic enterprises.',
    scrapedSuccessfully: true,
    wordCount: 3100,
  }
];

// Error Boundary to prevent any unhandled crash from blacking out the screen
class JarvisErrorBoundary extends Component<{ children: ReactNode; onExit: () => void }, { hasError: boolean; error: string }> {
  constructor(props: { children: ReactNode; onExit: () => void }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message || 'An unexpected error occurred in Jarvis Mode' };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[JARVIS ERROR BOUNDARY]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 bg-neutral-950 text-cyan-400 p-8 flex flex-col items-center justify-center font-mono">
          <AlertTriangle className="w-12 h-12 text-rose-500 mb-4 animate-bounce" />
          <h2 className="text-lg font-bold text-neutral-100 mb-2">JARVIS System Recovery</h2>
          <p className="text-xs text-neutral-400 mb-6 max-w-md text-center">{this.state.error}</p>
          <div className="flex gap-4">
            <button
              onClick={() => this.setState({ hasError: false, error: '' })}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all cursor-pointer"
            >
              Resume JARVIS
            </button>
            <button
              onClick={this.props.onExit}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold transition-all cursor-pointer"
            >
              Exit to Standard Arena
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function JarvisMode(props: JarvisModeProps) {
  return (
    <JarvisErrorBoundary onExit={props.onExit}>
      <JarvisModeInner {...props} />
    </JarvisErrorBoundary>
  );
}

function JarvisModeInner({ state, onExit, onSelectItem }: JarvisModeProps) {
  // Elements and DOM References
  const videoRef = useRef<HTMLVideoElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const floatingCardRef = useRef<HTMLDivElement>(null);
  
  // Voice & Audio
  const hasPlayedGreetingRef = useRef(false);
  const [voiceStatus, setVoiceStatus] = useState<JarvisVoiceStatus>('idle');

  // Tools & Arena Navigation
  const [tool, setTool] = useState<Tool>('marker');
  const [penColor, setPenColor] = useState<string>('#06b6d4');
  const [arenaTab, setArenaTab] = useState<ArenaTab>('sources');
  const [handTrackingEnabled, setHandTrackingEnabled] = useState(true);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // High-Level Gesture State (Only updated on state change to avoid 60fps re-render overhead)
  const [gestureState, setGestureState] = useState<GestureState>('IDLE');
  const [gestureText, setGestureText] = useState<string>('System Initializing');
  const [hoveredSourceId, setHoveredSourceId] = useState<string | null>(null);

  // Draggable / Grabbed Cards
  const [grabbedItem, setGrabbedItem] = useState<{
    source: DiscoveredSource;
    fromWorkspace: boolean;
    workspaceCardId?: string;
  } | null>(null);
  const grabbedItemRef = useRef(grabbedItem);
  grabbedItemRef.current = grabbedItem;

  const [placedCards, setPlacedCards] = useState<PlacedCard[]>([]);
  const placedCardsRef = useRef<PlacedCard[]>([]);
  placedCardsRef.current = placedCards;

  // Drawing strokes (Normalized coordinates 0..1)
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  strokesRef.current = strokes.filter((s): s is Stroke => Boolean(s && s.points));

  // Selected Inspector
  const [selectedNodeData, setSelectedNodeData] = useState<any>(null);

  // Gesture Recognition Tracking Refs
  const fistConsecutiveFramesRef = useRef(0);
  const openConsecutiveFramesRef = useRef(0);
  const isPinchingHysteresisRef = useRef(false);
  const lostTrackingFramesRef = useRef(0);
  const gestureStateRef = useRef<GestureState>('IDLE');
  gestureStateRef.current = gestureState;

  // Smoothing filters (stored purely in refs to avoid React re-renders)
  const smoothedCursorRef = useRef({ x: -100, y: -100, initialized: false });
  const smoothedPalmRef = useRef({ x: -100, y: -100, initialized: false });
  const currentToolRef = useRef<Tool>('marker');
  currentToolRef.current = tool;
  const penColorRef = useRef<string>('#06b6d4');
  penColorRef.current = penColor;

  // Mouse fallback tracking refs
  const isMouseDownRef = useRef(false);

  // Active sources list
  const sourcesList: DiscoveredSource[] = state.sources && state.sources.length > 0 ? state.sources : DEFAULT_SOURCES;
  const sourcesListRef = useRef<DiscoveredSource[]>(sourcesList);
  sourcesListRef.current = sourcesList;

  // Voice greeting using browser Web Speech API
  const playJarvisGreeting = useCallback(async () => {
    if (hasPlayedGreetingRef.current) return;
    const greetingText = 'Hello sir, jarvis at your assistance for research and real world data';
    try {
      setVoiceStatus('activating');
      const SpeechSynthesis = window.speechSynthesis;
      if (!SpeechSynthesis) throw new Error('Speech synthesis not supported');
      SpeechSynthesis.cancel();
      const loadVoices = new Promise<void>((resolve) => {
        if (SpeechSynthesis.getVoices().length > 0) resolve();
        else {
          SpeechSynthesis.onvoiceschanged = () => resolve();
          setTimeout(resolve, 500);
        }
      });
      await loadVoices;
      const utterance = new SpeechSynthesisUtterance(greetingText);
      utterance.rate = 0.88;
      utterance.pitch = 0.85;
      utterance.volume = 1.0;
      const voices = SpeechSynthesis.getVoices();
      const maleVoice = voices.find(v => 
        v.name.includes('Male') || 
        v.name.includes('David') || 
        v.name.includes('Daniel') ||
        v.name.includes('Google US English') ||
        (v.name.includes('en-US') && v.name.includes('Male'))
      ) || voices.find(v => v.lang.startsWith('en') && !v.name.includes('Female'));
      if (maleVoice) utterance.voice = maleVoice;
      utterance.onstart = () => setVoiceStatus('playing');
      utterance.onend = () => {
        setVoiceStatus('ready');
        hasPlayedGreetingRef.current = true;
      };
      utterance.onerror = () => {
        setVoiceStatus('unavailable');
        hasPlayedGreetingRef.current = true;
      };
      SpeechSynthesis.speak(utterance);
    } catch {
      setVoiceStatus('unavailable');
      hasPlayedGreetingRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (voiceStatus === 'idle') {
      const timer = setTimeout(() => {
        playJarvisGreeting();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [voiceStatus, playJarvisGreeting]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
      else if (e.key === 'm' || e.key === 'M') setHandTrackingEnabled(prev => !prev);
      else if (e.key === 'v' || e.key === 'V') playJarvisGreeting();
      else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) handleUndo();
      else if (e.key === '1') setTool('pointer');
      else if (e.key === '2') setTool('marker');
      else if (e.key === '3') setTool('eraser');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onExit, playJarvisGreeting]);

  // STABLE CANVAS RENDER FUNCTION (Reads purely from refs to remain 100% stable without triggering re-renders)
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const workspace = workspaceRef.current;
    if (!canvas || !workspace) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = workspace.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (width === 0 || height === 0) return;

    const dpr = window.devicePixelRatio || 1;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const allStrokes = (currentStrokeRef.current 
      ? [...strokesRef.current, currentStrokeRef.current] 
      : strokesRef.current).filter((s): s is Stroke => Boolean(s && s.points));

    for (const stroke of allStrokes) {
      if (!stroke || !stroke.points || stroke.points.length === 0) continue;

      ctx.save();
      if (stroke.isEraser) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = stroke.width;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const pts = stroke.points.map(p => ({ x: p.x * width, y: p.y * height }));

      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, stroke.width / 2, 0, Math.PI * 2);
        ctx.fillStyle = stroke.color;
        ctx.fill();
      } else if (pts.length === 2) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const midX = (pts[i].x + pts[i + 1].x) / 2;
          const midY = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }, []);

  // Responsive resize handler that resizes canvas buffer strictly on container size changes
  useEffect(() => {
    const ws = workspaceRef.current;
    if (!ws) return;

    const resizeCanvasBuffer = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = ws.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.round(rect.width * dpr);
      const targetH = Math.round(rect.height * dpr);

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
      }
      renderCanvas();
    };

    const observer = new ResizeObserver(() => {
      resizeCanvasBuffer();
    });
    observer.observe(ws);
    resizeCanvasBuffer();

    return () => observer.disconnect();
  }, [renderCanvas]);

  // Redraw when strokes state updates
  useEffect(() => {
    renderCanvas();
  }, [strokes, renderCanvas]);

  // Undo and Clear actions
  const handleUndo = () => {
    setStrokes(prev => prev.slice(0, -1));
  };

  const handleClearCanvas = () => {
    setStrokes([]);
    currentStrokeRef.current = null;
    renderCanvas();
  };

  // Delete placed card
  const handleDeleteCard = (cardId: string) => {
    setPlacedCards(prev => prev.filter(c => c.id !== cardId));
  };

  // Exponential moving average smoothing helper
  const smoothValue = (
    current: { x: number; y: number; initialized: boolean }, 
    targetX: number, 
    targetY: number, 
    baseAlpha = 0.38
  ) => {
    if (!current.initialized) {
      current.x = targetX;
      current.y = targetY;
      current.initialized = true;
    } else {
      const dist = Math.hypot(targetX - current.x, targetY - current.y);
      const alpha = Math.min(0.75, Math.max(baseAlpha, dist / 140));
      current.x += alpha * (targetX - current.x);
      current.y += alpha * (targetY - current.y);
    }
    return { x: current.x, y: current.y };
  };

  // MediaPipe HandLandmarker lifecycle (Runs strictly once or on handTrackingEnabled toggle)
  useEffect(() => {
    let handLandmarker: any = null;
    let animationFrameId: number;
    let stream: MediaStream | null = null;
    let isCancelled = false;

    const initMediaPipe = async () => {
      if (!handTrackingEnabled) {
        setGestureText('Hand Tracking Disabled');
        return;
      }
      setGestureText('Initializing Vision Pipeline...');

      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        if (isCancelled) return;

        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });
        if (isCancelled) return;

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 30 }
            }
          });
          if (isCancelled) {
            stream.getTracks().forEach(t => t.stop());
            return;
          }
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadeddata = () => {
              if (isCancelled) return;
              setIsCameraActive(true);
              setGestureText('Tracking Active');
              renderLoop();
            };
            videoRef.current.play().catch(e => console.warn('Video play warning:', e));
          }
        }
      } catch (err) {
        console.warn("MediaPipe Vision note:", err);
        setGestureText('Camera Offline · Mouse Fallback Active');
        setIsCameraActive(false);
      }
    };

    let lastVideoTime = -1;

    const renderLoop = () => {
      if (isCancelled) return;

      if (videoRef.current && videoRef.current.readyState >= 2 && handLandmarker) {
        const video = videoRef.current;
        if (video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          const startTimeMs = performance.now();
          const results = handLandmarker.detectForVideo(video, startTimeMs);

          if (results.landmarks && results.landmarks.length > 0) {
            lostTrackingFramesRef.current = 0;
            const landmarks = results.landmarks[0];

            // Key Landmarks
            const wrist = landmarks[0];
            const thumbTip = landmarks[4];
            const indexTip = landmarks[8];
            const middleMcp = landmarks[9];

            // Mirrored Screen Coordinates
            const rawIndexX = (1 - indexTip.x) * window.innerWidth;
            const rawIndexY = indexTip.y * window.innerHeight;

            const smoothedCursor = smoothValue(smoothedCursorRef.current, rawIndexX, rawIndexY, 0.4);

            // DIRECT DOM CURSOR POSITION UPDATE (Ultra-fast, 0 React re-renders!)
            if (cursorRef.current) {
              cursorRef.current.style.transform = `translate3d(${smoothedCursor.x}px, ${smoothedCursor.y}px, 0) translate(-50%, -50%)`;
              cursorRef.current.style.display = 'flex';
            }

            // Palm Center: Average of Wrist (0) and Finger Bases (5, 9, 13, 17)
            const rawPalmX = (1 - (landmarks[0].x + landmarks[5].x + landmarks[9].x + landmarks[13].x + landmarks[17].x) / 5) * window.innerWidth;
            const rawPalmY = ((landmarks[0].y + landmarks[5].y + landmarks[9].y + landmarks[13].y + landmarks[17].y) / 5) * window.innerHeight;
            const smoothedPalm = smoothValue(smoothedPalmRef.current, rawPalmX, rawPalmY, 0.4);

            // Update floating grabbed card position directly via DOM
            if (floatingCardRef.current && grabbedItemRef.current) {
              floatingCardRef.current.style.transform = `translate3d(${smoothedPalm.x}px, ${smoothedPalm.y}px, 0) translate(-50%, -50%)`;
              floatingCardRef.current.style.display = 'block';
            }

            // Hand Size Normalization (Wrist to Middle Finger MCP)
            const handSize = Math.max(0.001, Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y));

            // Closed Fist Detection
            const fingerPairs = [
              { tip: 8, pip: 6 },
              { tip: 12, pip: 10 },
              { tip: 16, pip: 14 },
              { tip: 20, pip: 18 }
            ];

            let curledFingersCount = 0;
            let extendedFingersCount = 0;

            fingerPairs.forEach(f => {
              const dTipWrist = Math.hypot(landmarks[f.tip].x - wrist.x, landmarks[f.tip].y - wrist.y);
              const dPipWrist = Math.hypot(landmarks[f.pip].x - wrist.x, landmarks[f.pip].y - wrist.y);

              if (dTipWrist < dPipWrist * 1.05 || dTipWrist / handSize < 0.95) {
                curledFingersCount++;
              }
              if (dTipWrist > dPipWrist * 1.15) {
                extendedFingersCount++;
              }
            });

            if (curledFingersCount === 4) {
              fistConsecutiveFramesRef.current++;
              openConsecutiveFramesRef.current = 0;
            } else if (extendedFingersCount >= 3) {
              openConsecutiveFramesRef.current++;
              fistConsecutiveFramesRef.current = 0;
            } else {
              fistConsecutiveFramesRef.current = Math.max(0, fistConsecutiveFramesRef.current - 1);
            }

            const isFistStable = fistConsecutiveFramesRef.current >= 5;
            const isOpenStable = openConsecutiveFramesRef.current >= 3;

            // Pinch Detection with Hysteresis
            const rawPinchDistance = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
            const pinchRatio = rawPinchDistance / handSize;

            if (!isPinchingHysteresisRef.current) {
              if (pinchRatio < 0.25) {
                isPinchingHysteresisRef.current = true;
              }
            } else {
              if (pinchRatio > 0.35) {
                isPinchingHysteresisRef.current = false;
              }
            }
            const isPinching = isPinchingHysteresisRef.current;

            // Workspace bounds inspection
            const wsRect = workspaceRef.current?.getBoundingClientRect();
            const isIndexInWorkspace = wsRect 
              ? smoothedCursor.x >= wsRect.left && smoothedCursor.x <= wsRect.right &&
                smoothedCursor.y >= wsRect.top && smoothedCursor.y <= wsRect.bottom
              : false;

            const isPalmInWorkspace = wsRect
              ? smoothedPalm.x >= wsRect.left && smoothedPalm.x <= wsRect.right &&
                smoothedPalm.y >= wsRect.top && smoothedPalm.y <= wsRect.bottom
              : false;

            // Hover check using palm center
            const hoveredEl = document.elementFromPoint(smoothedPalm.x, smoothedPalm.y);
            const sourceCardEl = hoveredEl?.closest('[data-jarvis-source-id]');
            const sourceCardId = sourceCardEl?.getAttribute('data-jarvis-source-id') || null;
            const workspaceCardEl = hoveredEl?.closest('[data-workspace-card-id]');
            const workspaceCardId = workspaceCardEl?.getAttribute('data-workspace-card-id') || null;

            // GESTURE STATE MACHINE (Fist has priority over Pinch)
            const currentMachineState = gestureStateRef.current;

            if (isFistStable) {
              // End active stroke on fist
              if (currentStrokeRef.current) {
                const strokeToSave = currentStrokeRef.current;
                currentStrokeRef.current = null;
                setStrokes(prev => [...prev.filter(Boolean), strokeToSave]);
                renderCanvas();
              }

              if (currentMachineState !== 'GRABBING') {
                if (sourceCardId) {
                  const targetSource = sourcesListRef.current.find(s => s.id === sourceCardId);
                  if (targetSource) {
                    setGrabbedItem({ source: targetSource, fromWorkspace: false });
                    setGestureState('GRABBING');
                    setGestureText('Grabbing: Source Card');
                  }
                } else if (workspaceCardId) {
                  const targetPlaced = placedCardsRef.current.find(c => c.id === workspaceCardId);
                  if (targetPlaced) {
                    setGrabbedItem({ source: targetPlaced.source, fromWorkspace: true, workspaceCardId: targetPlaced.id });
                    setGestureState('GRABBING');
                    setGestureText('Grabbing: Moving Card');
                  }
                }
              }
            } else if (isOpenStable && currentMachineState === 'GRABBING') {
              // Drop trigger
              setGestureState('DROPPING');
              setGestureText('Dropping Item');

              const item = grabbedItemRef.current;
              if (item) {
                if (isPalmInWorkspace && wsRect) {
                  const cardWidth = 240;
                  const cardHeight = 120;
                  const dropX = smoothedPalm.x - wsRect.left - cardWidth / 2;
                  const dropY = smoothedPalm.y - wsRect.top - cardHeight / 2;

                  const nx = Math.max(0.01, Math.min(0.78, dropX / wsRect.width));
                  const ny = Math.max(0.02, Math.min(0.78, dropY / wsRect.height));

                  if (item.fromWorkspace && item.workspaceCardId) {
                    setPlacedCards(prev => prev.map(c => c.id === item.workspaceCardId ? { ...c, nx, ny } : c));
                  } else {
                    const newCard: PlacedCard = {
                      id: `placed-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                      source: item.source,
                      nx,
                      ny
                    };
                    setPlacedCards(prev => [...prev, newCard]);
                  }
                }
              }

              setGrabbedItem(null);
              if (floatingCardRef.current) {
                floatingCardRef.current.style.display = 'none';
              }

              setTimeout(() => {
                if (gestureStateRef.current === 'DROPPING') {
                  setGestureState('IDLE');
                  setGestureText('Idle');
                }
              }, 180);
            } else if (currentMachineState !== 'GRABBING') {
              // Pen Drawing Logic
              if (isPinching && isIndexInWorkspace) {
                if (currentMachineState !== 'DRAWING') {
                  setGestureState('DRAWING');
                  setGestureText('Drawing');
                }

                if (wsRect) {
                  const nx = (smoothedCursor.x - wsRect.left) / wsRect.width;
                  const ny = (smoothedCursor.y - wsRect.top) / wsRect.height;

                  if (!currentStrokeRef.current) {
                    currentStrokeRef.current = {
                      id: `s-${Date.now()}`,
                      points: [{ x: nx, y: ny }],
                      color: penColorRef.current,
                      width: currentToolRef.current === 'eraser' ? 28 : 3.5,
                      isEraser: currentToolRef.current === 'eraser'
                    };
                  } else if (currentStrokeRef.current.points) {
                    currentStrokeRef.current.points.push({ x: nx, y: ny });
                  }
                  renderCanvas();
                }
              } else {
                if (currentStrokeRef.current) {
                  const strokeToSave = currentStrokeRef.current;
                  currentStrokeRef.current = null;
                  setStrokes(prev => [...prev.filter(Boolean), strokeToSave]);
                  renderCanvas();
                }

                const targetHoverId = sourceCardId || workspaceCardId;
                if (targetHoverId) {
                  if (currentMachineState !== 'HOVER' || hoveredSourceId !== targetHoverId) {
                    setGestureState('HOVER');
                    setHoveredSourceId(targetHoverId);
                    setGestureText('Hover: Fist to Grab');
                  }
                } else {
                  if (currentMachineState !== 'IDLE') {
                    setGestureState('IDLE');
                    setHoveredSourceId(null);
                    setGestureText('Open Palm: Hover');
                  }
                }
              }
            }
          } else {
            // No hands in frame
            lostTrackingFramesRef.current++;
            if (lostTrackingFramesRef.current > 6) {
              if (currentStrokeRef.current) {
                const strokeToSave = currentStrokeRef.current;
                currentStrokeRef.current = null;
                setStrokes(prev => [...prev.filter(Boolean), strokeToSave]);
                renderCanvas();
              }
              if (gestureStateRef.current !== 'IDLE') {
                setGestureState('IDLE');
                setGestureText('No Hands Detected');
                setHoveredSourceId(null);
              }
              if (cursorRef.current) {
                cursorRef.current.style.display = 'none';
              }
              smoothedCursorRef.current.initialized = false;
              smoothedPalmRef.current.initialized = false;
            }
          }
        }
      }
      animationFrameId = requestAnimationFrame(renderLoop);
    };

    initMediaPipe();

    return () => {
      isCancelled = true;
      cancelAnimationFrame(animationFrameId);
      if (handLandmarker) {
        try { handLandmarker.close(); } catch {}
      }
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, [handTrackingEnabled, renderCanvas]);

  // Snapshot Export
  const handleExport = useCallback(async () => {
    if (containerRef.current) {
      setGestureText('Exporting Snapshot...');
      try {
        const canvas = await html2canvas(containerRef.current, { backgroundColor: '#0a0a0a' });
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `Vikaas_Jarvis_Workspace_${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
        setGestureText('Export Complete');
      } catch (e) {
        console.error(e);
        setGestureText('Export Failed');
      }
    }
  }, []);

  // MOUSE & TOUCH FALLBACK
  const handleWorkspaceMouseDown = (e: React.MouseEvent) => {
    const ws = workspaceRef.current;
    if (!ws) return;
    isMouseDownRef.current = true;
    const rect = ws.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    currentStrokeRef.current = {
      id: `s-mouse-${Date.now()}`,
      points: [{ x: nx, y: ny }],
      color: penColorRef.current,
      width: currentToolRef.current === 'eraser' ? 28 : 3.5,
      isEraser: currentToolRef.current === 'eraser'
    };
    renderCanvas();
  };

  const handleWorkspaceMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDownRef.current || !currentStrokeRef.current) return;
    const ws = workspaceRef.current;
    if (!ws) return;
    const rect = ws.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    if (currentStrokeRef.current?.points) {
      currentStrokeRef.current.points.push({ x: nx, y: ny });
    }
    renderCanvas();
  };

  const handleWorkspaceMouseUp = () => {
    if (isMouseDownRef.current && currentStrokeRef.current) {
      const strokeToSave = currentStrokeRef.current;
      currentStrokeRef.current = null;
      setStrokes(prev => [...prev.filter(Boolean), strokeToSave]);
      renderCanvas();
    }
    isMouseDownRef.current = false;
  };

  // HTML5 Drag-and-Drop Fallback for source cards
  const handleCardDragStart = (e: React.DragEvent, source: DiscoveredSource, cardId?: string) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ source, cardId }));
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const handleWorkspaceDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleWorkspaceDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const rawData = e.dataTransfer.getData('application/json');
    if (!rawData) return;
    try {
      const data = JSON.parse(rawData);
      const ws = workspaceRef.current;
      if (!ws) return;
      const rect = ws.getBoundingClientRect();
      const dropX = e.clientX - rect.left - 120;
      const dropY = e.clientY - rect.top - 60;
      const nx = Math.max(0.01, Math.min(0.78, dropX / rect.width));
      const ny = Math.max(0.02, Math.min(0.78, dropY / rect.height));

      if (data.cardId) {
        setPlacedCards(prev => prev.map(c => c.id === data.cardId ? { ...c, nx, ny } : c));
      } else {
        const newCard: PlacedCard = {
          id: `placed-mouse-${Date.now()}`,
          source: data.source,
          nx,
          ny
        };
        setPlacedCards(prev => [...prev, newCard]);
      }
    } catch (err) {
      console.warn("Drop parse error", err);
    }
  };

  const getVoiceStatusColor = () => {
    switch (voiceStatus) {
      case 'activating': return 'text-amber-400';
      case 'online': return 'text-cyan-400';
      case 'playing': return 'text-emerald-400';
      case 'ready': return 'text-emerald-300';
      case 'unavailable': return 'text-neutral-500';
      default: return 'text-neutral-400';
    }
  };

  const getVoiceStatusText = () => {
    switch (voiceStatus) {
      case 'activating': return 'JARVIS ACTIVATING';
      case 'online': return 'JARVIS ONLINE';
      case 'playing': return 'JARVIS SPEAKING';
      case 'ready': return 'JARVIS READY';
      case 'unavailable': return 'VOICE UNAVAILABLE';
      default: return 'JARVIS IDLE';
    }
  };

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-50 bg-neutral-950 text-cyan-500 overflow-hidden font-mono selection:bg-cyan-900/20 selection:text-cyan-200 flex flex-col"
    >
      {/* TOP HUD BAR */}
      <div className="h-16 border-b border-cyan-950/60 bg-neutral-950/90 backdrop-blur-md px-5 flex justify-between items-center z-[200] shrink-0 select-none">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-950/80 border border-cyan-800/80 shadow-[0_0_12px_rgba(6,182,212,0.3)]">
              <ShieldCheck className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-widest text-cyan-400 uppercase">J.A.R.V.I.S. MODE</h1>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-950/90 border border-cyan-800 text-cyan-300">
                  v2.0 DUAL ARENA
                </span>
              </div>
              <p className="text-[10px] text-cyan-600/90">Code Cubicle 6.0 · Gesture & Arena Intelligence</p>
            </div>
          </div>

          {/* Voice Status Indicator */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-900/80 border border-neutral-800 backdrop-blur-sm ${getVoiceStatusColor()}`}>
            {voiceStatus === 'playing' && <div className="w-2 h-2 rounded-full bg-current animate-pulse" />}
            <span className="text-[10px] font-bold uppercase">{getVoiceStatusText()}</span>
          </div>

          {/* Camera Status */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-900/80 border border-neutral-800 backdrop-blur-sm ${isCameraActive ? 'text-emerald-400' : 'text-neutral-500'}`}>
            <Monitor className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase">
              {isCameraActive ? 'CAMERA ONLINE' : 'MOUSE FALLBACK'}
            </span>
          </div>

          {/* Hand Tracking Status */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-900/80 border border-neutral-800 backdrop-blur-sm ${handTrackingEnabled ? 'text-cyan-400' : 'text-neutral-500'}`}>
            <Crosshair className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase">
              {handTrackingEnabled ? 'HAND TRACKING' : 'DISABLED'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Active Gesture Mode Badge */}
          <div className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold uppercase backdrop-blur-sm transition-all flex items-center gap-2 ${
            gestureState === 'DRAWING' ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.4)]' :
            gestureState === 'GRABBING' ? 'bg-amber-950/80 border-amber-500 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.4)]' :
            gestureState === 'HOVER' ? 'bg-indigo-950/80 border-indigo-500 text-indigo-300' :
            'bg-neutral-900/80 border-neutral-800 text-neutral-400'
          }`}>
            <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
            <span>MODE: {gestureState}</span>
            <span className="text-[9px] text-neutral-400">({gestureText})</span>
          </div>

          {/* Exit Button */}
          <button
            onClick={onExit}
            className="px-4 py-2 bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white text-[10px] font-bold rounded-lg transition-all cursor-pointer backdrop-blur-sm"
          >
            EXIT [ESC]
          </button>
        </div>
      </div>

      {/* MAIN SCREEN SPLIT: ARENA (50%) & WORKSPACE (50%) */}
      <div className="flex-1 w-full h-[calc(100vh-4rem)] flex overflow-hidden p-3 gap-3">
        
        {/* ========================================================= */}
        {/* LEFT 50%: THE ARENA (Agents, Feed, Grabbable Sources) */}
        {/* ========================================================= */}
        <div className="w-1/2 h-full flex flex-col rounded-xl border border-cyan-950/70 bg-neutral-950/90 overflow-hidden shadow-2xl relative">
          
          {/* Arena Subheader: Research Agents & Tabs */}
          <div className="p-3 border-b border-neutral-800/80 bg-neutral-900/60 flex flex-col gap-2.5 shrink-0">
            {/* Agent Statuses Banner */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider">RESEARCH ARENA</span>
              </div>
              
              {/* Agent Badges */}
              <div className="flex items-center gap-2 text-[10px]">
                <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-950/70 border border-cyan-800/60 text-cyan-300">
                  <Sparkles className="w-2.5 h-2.5" /> Explorer Active
                </span>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-950/70 border border-indigo-800/60 text-indigo-300">
                  <ShieldCheck className="w-2.5 h-2.5" /> Investigator
                </span>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/70 border border-amber-800/60 text-amber-300">
                  <Cpu className="w-2.5 h-2.5" /> Arbiter Judge
                </span>
              </div>
            </div>

            {/* Arena Tab Bar */}
            <div className="flex items-center justify-between pt-1 border-t border-neutral-800/50">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setArenaTab('sources')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    arenaTab === 'sources' 
                      ? 'bg-cyan-900/60 border border-cyan-600 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]' 
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                  }`}
                >
                  Source Boxes ({sourcesList.length})
                </button>
                <button
                  onClick={() => setArenaTab('feed')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    arenaTab === 'feed' 
                      ? 'bg-cyan-900/60 border border-cyan-600 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]' 
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                  }`}
                >
                  Live Activity Feed
                </button>
                <button
                  onClick={() => setArenaTab('graph')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    arenaTab === 'graph' 
                      ? 'bg-cyan-900/60 border border-cyan-600 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]' 
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                  }`}
                >
                  Research Graph
                </button>
              </div>

              <div className="text-[10px] text-neutral-500 font-mono">
                Gesture: Fist to Grab Source
              </div>
            </div>
          </div>

          {/* Arena Content Area */}
          <div className="flex-1 overflow-hidden relative">
            
            {/* 1. SOURCES VIEW (Grabbable Source Boxes) */}
            {arenaTab === 'sources' && (
              <div className="h-full overflow-y-auto p-4 space-y-3 custom-scrollbar">
                <div className="text-[11px] text-cyan-400/80 mb-2 flex items-center justify-between">
                  <span>Hover palm over box, close fist to grab and drag to workspace:</span>
                  <span className="text-[9px] text-neutral-500 font-mono">Mouse drag-and-drop enabled</span>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {sourcesList.map(src => {
                    const isHovered = hoveredSourceId === src.id;
                    const isGrabbed = grabbedItem?.source.id === src.id;

                    return (
                      <div
                        key={src.id}
                        data-jarvis-source-id={src.id}
                        draggable
                        onDragStart={(e) => handleCardDragStart(e, src)}
                        onClick={() => setSelectedNodeData(src)}
                        className={`p-3.5 rounded-xl border transition-all duration-200 relative group cursor-grab active:cursor-grabbing backdrop-blur-md select-none ${
                          isGrabbed 
                            ? 'opacity-35 scale-[0.98] border-dashed border-cyan-500 bg-neutral-900/40' 
                            : isHovered
                              ? 'border-cyan-400 bg-neutral-900/90 shadow-[0_0_20px_rgba(6,182,212,0.35)] scale-[1.01]' 
                              : 'border-neutral-800 bg-neutral-900/60 hover:border-cyan-800/80 hover:bg-neutral-900/80'
                        }`}
                      >
                        {/* Source Header */}
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            <span className="text-xs font-mono font-bold text-neutral-200 group-hover:text-cyan-300">
                              {src.domain}
                            </span>
                          </div>
                          <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${
                            src.authority === 'OFFICIAL_GOV' ? 'bg-emerald-950/70 border-emerald-800 text-emerald-400' :
                            src.authority === 'PRIMARY_COMPANY' ? 'bg-cyan-950/70 border-cyan-800 text-cyan-400' :
                            'bg-neutral-900 border-neutral-700 text-neutral-400'
                          }`}>
                            {src.authority}
                          </span>
                        </div>

                        {/* Title */}
                        <div className="text-xs font-semibold text-neutral-100 line-clamp-1 mb-1">
                          {src.title}
                        </div>

                        {/* Snippet */}
                        <p className="text-[11px] text-neutral-400 line-clamp-2 italic font-serif mb-2">
                          "{src.snippet}"
                        </p>

                        {/* Footer */}
                        <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500 pt-2 border-t border-neutral-800/60">
                          <span className="uppercase text-cyan-600">Discovered by: {src.discoveredBy}</span>
                          <span className="flex items-center gap-1 text-cyan-400">
                            Fist to Grab <Move className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. ACTIVITY FEED VIEW */}
            {arenaTab === 'feed' && (
              <div className="h-full p-2">
                <ActivityFeed 
                  events={state.events}
                  onSelectEvent={(evt) => setSelectedNodeData(evt)}
                />
              </div>
            )}

            {/* 3. RESEARCH GRAPH VIEW */}
            {arenaTab === 'graph' && (
              <div className="h-full w-full relative">
                <ResearchGraph
                  state={state}
                  isStatic={false}
                  onSelectItem={useCallback((item: any) => {
                    setSelectedNodeData(item);
                    onSelectItem(item);
                  }, [onSelectItem])}
                />
              </div>
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* RIGHT 50%: THE WORKSPACE (Large Drawing Board) */}
        {/* ========================================================= */}
        <div 
          ref={workspaceRef}
          onMouseDown={handleWorkspaceMouseDown}
          onMouseMove={handleWorkspaceMouseMove}
          onMouseUp={handleWorkspaceMouseUp}
          onDragOver={handleWorkspaceDragOver}
          onDrop={handleWorkspaceDrop}
          className="w-1/2 h-full flex flex-col rounded-xl border-2 border-cyan-500/40 bg-neutral-950/90 relative overflow-hidden shadow-[0_0_30px_rgba(6,182,212,0.1)] select-none"
          style={{ cursor: tool === 'marker' ? 'crosshair' : tool === 'eraser' ? 'cell' : 'default' }}
        >
          {/* Subtle Label and Stats */}
          <div className="absolute top-3 left-4 z-30 flex items-center gap-2 pointer-events-none">
            <span className="text-[11px] font-bold text-cyan-400 tracking-wider uppercase font-mono bg-neutral-900/90 px-2.5 py-1 rounded border border-cyan-800/60 backdrop-blur-sm shadow-md">
              WORKSPACE
            </span>
            <span className="text-[10px] text-neutral-500 font-mono bg-neutral-900/80 px-2 py-1 rounded border border-neutral-800">
              {placedCards.length} cards · {strokes.length} strokes
            </span>
          </div>

          {/* Workspace Controls Header (Undo, Clear, Tools) */}
          <div className="absolute top-3 right-4 z-30 flex items-center gap-2 bg-neutral-900/90 border border-neutral-800/80 p-1 rounded-xl backdrop-blur-md shadow-lg pointer-events-auto">
            {/* Tool: Pen */}
            <button
              onClick={() => setTool('marker')}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                tool === 'marker' 
                  ? 'bg-cyan-900/70 border-cyan-500 text-cyan-300' 
                  : 'border-transparent text-neutral-400 hover:text-white'
              }`}
              title="Pen (Pinch to write) [2]"
            >
              <PenTool className="w-4 h-4" />
            </button>

            {/* Tool: Eraser */}
            <button
              onClick={() => setTool('eraser')}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                tool === 'eraser' 
                  ? 'bg-cyan-900/70 border-cyan-500 text-cyan-300' 
                  : 'border-transparent text-neutral-400 hover:text-white'
              }`}
              title="Eraser [3]"
            >
              <Eraser className="w-4 h-4" />
            </button>

            {/* Pen Color Swatches */}
            <div className="flex items-center gap-1 px-1 border-x border-neutral-800">
              {['#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#ffffff'].map(c => (
                <button
                  key={c}
                  onClick={() => { setPenColor(c); setTool('marker'); }}
                  className={`w-3.5 h-3.5 rounded-full border transition-transform cursor-pointer ${
                    penColor === c && tool === 'marker' ? 'scale-125 border-white' : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>

            {/* Undo */}
            <button
              onClick={handleUndo}
              disabled={strokes.length === 0}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-cyan-300 hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
              title="Undo Stroke [Ctrl+Z]"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Clear Workspace */}
            <button
              onClick={handleClearCanvas}
              disabled={strokes.length === 0}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
              title="Clear Workspace Strokes"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Export */}
            <button
              onClick={handleExport}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-cyan-300 hover:bg-neutral-800 transition-all cursor-pointer"
              title="Export Snapshot"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          {/* LAYER 1: Subtle Grid Background */}
          <div 
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, #06b6d4 1px, transparent 0)',
              backgroundSize: '24px 24px'
            }}
          />

          {/* LAYER 2: Placed Source Boxes / Cards */}
          <div className="absolute inset-0 z-10 pointer-events-none">
            {placedCards.map(card => {
              const isCardHovered = hoveredSourceId === card.id;

              return (
                <div
                  key={card.id}
                  data-workspace-card-id={card.id}
                  draggable
                  onDragStart={(e) => handleCardDragStart(e, card.source, card.id)}
                  className={`absolute w-64 rounded-xl border p-3 backdrop-blur-md shadow-2xl transition-all duration-150 select-none pointer-events-auto cursor-grab active:cursor-grabbing group ${
                    isCardHovered
                      ? 'border-cyan-400 bg-neutral-900/95 ring-2 ring-cyan-400/60 shadow-[0_0_20px_rgba(6,182,212,0.4)]'
                      : 'border-cyan-900/80 bg-neutral-900/90 hover:border-cyan-600'
                  }`}
                  style={{
                    left: `${card.nx * 100}%`,
                    top: `${card.ny * 100}%`,
                  }}
                >
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="text-xs font-mono font-bold text-cyan-300 truncate max-w-[140px]">
                        {card.source.domain}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {card.source.url && (
                        <a
                          href={card.source.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-neutral-500 hover:text-cyan-400 transition-colors p-0.5"
                          title="Open Link"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <button
                        onClick={() => handleDeleteCard(card.id)}
                        className="text-neutral-500 hover:text-rose-400 transition-colors p-0.5 cursor-pointer"
                        title="Remove Card"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div className="text-[11px] font-semibold text-neutral-100 line-clamp-1 mb-1">
                    {card.source.title}
                  </div>

                  <p className="text-[10px] text-neutral-400 line-clamp-2 italic font-serif">
                    "{card.source.snippet}"
                  </p>
                </div>
              );
            })}
          </div>

          {/* LAYER 3: Transparent Digital Pen Drawing Canvas */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 z-20 pointer-events-none"
          />

          {/* Hint Overlay when workspace is empty */}
          {placedCards.length === 0 && strokes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-neutral-600 pointer-events-none select-none z-10">
              <Sparkles className="w-8 h-8 text-cyan-500/30 mb-2" />
              <p className="text-sm font-semibold text-neutral-400">Pinch Index + Thumb to Draw Notes</p>
              <p className="text-xs text-neutral-600 mt-1 max-w-sm">
                Close fist over any source card on the left to grab and paste it here. Use pen or mouse to sketch notes and arrows around placed items.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* FLOATING CLONE OF GRABBED ITEM (Position updated directly via DOM ref) */}
      <div
        ref={floatingCardRef}
        className="fixed pointer-events-none z-[400] top-0 left-0 w-64 rounded-xl border-2 border-cyan-400 bg-neutral-900/95 p-3.5 shadow-[0_0_30px_rgba(6,182,212,0.6)] backdrop-blur-md will-change-transform hidden"
      >
        {grabbedItem && (
          <>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono font-bold text-cyan-300">
                {grabbedItem.source.domain}
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                GRABBED
              </span>
            </div>
            <div className="text-xs font-semibold text-neutral-100 line-clamp-1 mb-1">
              {grabbedItem.source.title}
            </div>
            <p className="text-[10px] text-neutral-400 line-clamp-2 italic">
              "{grabbedItem.source.snippet}"
            </p>
          </>
        )}
      </div>

      {/* VISIBLE ON-SCREEN HAND CURSOR (Position updated directly via DOM ref for 60fps smoothness) */}
      <div
        ref={cursorRef}
        className="fixed pointer-events-none z-[500] top-0 left-0 items-center justify-center select-none will-change-transform hidden"
      >
        {gestureState === 'GRABBING' ? (
          <div className="w-10 h-10 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.6)]">
            <Grab className="w-5 h-5 text-amber-300" />
          </div>
        ) : gestureState === 'DRAWING' ? (
          <div className="relative flex items-center justify-center">
            <div 
              className="w-3.5 h-3.5 rounded-full shadow-[0_0_12px_rgba(6,182,212,0.8)] border border-white"
              style={{ backgroundColor: penColor }}
            />
            <div className="absolute -bottom-1 -right-1">
              <PenTool className="w-3 h-3 text-cyan-300 fill-cyan-400/30" />
            </div>
          </div>
        ) : (
          <div className="relative flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.5)] animate-pulse" />
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 absolute" />
          </div>
        )}

        {/* State label tag */}
        <div className="absolute left-7 top-1 px-1.5 py-0.5 rounded bg-neutral-950/90 border border-cyan-800 text-[9px] font-mono text-cyan-300 whitespace-nowrap shadow-md">
          {gestureState}
        </div>
      </div>

      {/* Hidden Video Feed for MediaPipe */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* Inspector Details Overlay */}
      {selectedNodeData && (
        <div className="absolute bottom-4 right-4 w-80 bg-neutral-950/95 border border-cyan-800 p-4 rounded-xl backdrop-blur-md shadow-2xl pointer-events-auto z-[250] transition-all duration-300">
          <div className="flex justify-between items-center mb-2 border-b border-neutral-800 pb-2">
            <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              DATA INSPECTOR
            </h3>
            <button 
              onClick={() => setSelectedNodeData(null)} 
              className="text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-[10px] text-neutral-300 space-y-1.5 overflow-y-auto max-h-48 custom-scrollbar">
            <pre className="whitespace-pre-wrap font-mono leading-relaxed">
              {JSON.stringify(selectedNodeData, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
