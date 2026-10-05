import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ResearchState } from '../../types/research';
import { ResearchGraph } from '../graph/ResearchGraph';
import { ShieldCheck, Crosshair, X, PenTool, Eraser, Download, MousePointer2, Maximize2, Minimize2, RotateCcw, Mic, MicOff, Monitor } from 'lucide-react';
// @ts-ignore
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import html2canvas from 'html2canvas';

interface JarvisModeProps {
  state: ResearchState;
  onExit: () => void;
  onSelectItem: (item: any) => void;
}

type Tool = 'pointer' | 'marker' | 'eraser';
type JarvisVoiceStatus = 'idle' | 'activating' | 'online' | 'ready' | 'unavailable' | 'playing';

export function JarvisMode({ state, onExit, onSelectItem }: JarvisModeProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasPlayedGreetingRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const [gesture, setGesture] = useState<string>('Initializing Camera...');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 });
  const [selectedNodeData, setSelectedNodeData] = useState<any>(null);
  const [tool, setTool] = useState<Tool>('pointer');
  const [isTransitioning, setIsTransitioning] = useState(true);
  const [voiceStatus, setVoiceStatus] = useState<JarvisVoiceStatus>('idle');
  const [handTrackingEnabled, setHandTrackingEnabled] = useState(true);
  const [selectedGraphItem, setSelectedGraphItem] = useState<any>(null);

  // Virtual Notebook Panning & Dragging Nodes
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [placedNodes, setPlacedNodes] = useState<Array<{ id: string; x: number; y: number; data: any; isUserCreated: boolean }>>([]);
  const draggingNodeRef = useRef<any>(null);

  // Refs for tracking movement without triggering re-renders in the loop
  const panState = useRef({ x: 0, y: 0, isPanning: false, lastHandsX: 0, lastHandsY: 0 });
  const isDrawing = useRef(false);
  const lastDrawPos = useRef({ x: 0, y: 0 });
  const currentTool = useRef<Tool>('pointer');
  const lastGestureRef = useRef<string>('');
  const gestureCooldownRef = useRef<number>(0);
  const lastActionRef = useRef<number>(0);

  // Update ref when state changes so the loop sees it
  useEffect(() => { currentTool.current = tool; }, [tool]);

  // Cinematic transition effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsTransitioning(false);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // Voice greeting with ElevenLabs
  const playJarvisGreeting = useCallback(async () => {
    if (hasPlayedGreetingRef.current) return;
    
    try {
      setVoiceStatus('activating');
      
      // Initialize audio context on user interaction
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      setVoiceStatus('online');
      
      const response = await fetch('/api/voice/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: 'Hello sir, jarvis at your assistance for research and real world data',
          language: 'en'
        })
      });
      
      if (!response.ok) {
        throw new Error('Voice synthesis failed');
      }
      
      setVoiceStatus('playing');
      const blob = await response.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      
      audio.onended = () => {
        setVoiceStatus('ready');
        hasPlayedGreetingRef.current = true;
      };
      
      audio.onerror = () => {
        setVoiceStatus('unavailable');
        hasPlayedGreetingRef.current = true;
      };
      
      await audio.play();
      
    } catch (error) {
      console.warn('[JARVIS] Voice greeting failed:', error);
      setVoiceStatus('unavailable');
      hasPlayedGreetingRef.current = true;
    }
  }, []);

  // Trigger greeting after transition completes
  useEffect(() => {
    if (!isTransitioning && voiceStatus === 'idle') {
      playJarvisGreeting();
    }
  }, [isTransitioning, voiceStatus, playJarvisGreeting]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onExit();
      } else if (e.key === 'f' || e.key === 'F') {
        // Fit graph to screen - handled by React Flow
      } else if (e.key === 'r' || e.key === 'R') {
        // Reset layout
        setPanOffset({ x: 0, y: 0 });
        setPlacedNodes([]);
      } else if (e.key === 'm' || e.key === 'M') {
        setHandTrackingEnabled(prev => !prev);
      } else if (e.key === 'v' || e.key === 'V') {
        if (voiceStatus === 'unavailable' || voiceStatus === 'ready') {
          playJarvisGreeting();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onExit, voiceStatus, playJarvisGreeting]);

  // Set up canvas size
  useEffect(() => {
    if (canvasRef.current && containerRef.current) {
      // Create a massive canvas to allow drawing when panned
      canvasRef.current.width = window.innerWidth * 3;
      canvasRef.current.height = window.innerHeight * 3;
      // Center the origin of drawing area
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, []);

  const drawOnCanvas = (x: number, y: number, isDrawingActive: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // The canvas is 3x the window, positioned at -100vw, -100vh.
    // The canvas container is ONLY inside the right 70% panel now, but we'll map absolute coordinates.
    // Let's just use bounding client rect of container.
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Relative to the 300vw canvas container taking into account CSS translation
    const canvasX = x - rect.left - panState.current.x + window.innerWidth;
    const canvasY = y - rect.top - panState.current.y + window.innerHeight;

    if (isDrawingActive) {
      if (!isDrawing.current) {
        isDrawing.current = true;
        lastDrawPos.current = { x: canvasX, y: canvasY };
        ctx.beginPath();
        ctx.moveTo(canvasX, canvasY);
        ctx.lineTo(canvasX, canvasY);
        ctx.stroke();
      } else {
        if (currentTool.current === 'marker') {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = '#06b6d4'; // Cyan
          ctx.lineWidth = 4;
        } else if (currentTool.current === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = 40; // thick eraser
        }

        ctx.beginPath();
        ctx.moveTo(lastDrawPos.current.x, lastDrawPos.current.y);
        ctx.lineTo(canvasX, canvasY);
        ctx.stroke();
        lastDrawPos.current = { x: canvasX, y: canvasY };
      }
    } else {
      isDrawing.current = false;
      ctx.beginPath();
    }
  };

  useEffect(() => {
    let handLandmarker: any;
    let animationFrameId: number;
    let stream: MediaStream | null = null;

    const initMediaPipe = async () => {
      if (!handTrackingEnabled) {
        setGesture('Hand Tracking Disabled');
        return;
      }

      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2
        });

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
            setIsCameraActive(true);
            setGesture('Tracking Active');
          }
        }
      } catch (err) {
        console.error("MediaPipe Error", err);
        setGesture('Camera Error - Mouse Fallback Active');
      }
    };

    if (handTrackingEnabled) {
      initMediaPipe();
    }

    let lastVideoTime = -1;
    const renderLoop = async () => {
      if (!handTrackingEnabled) {
        animationFrameId = requestAnimationFrame(renderLoop);
        return;
      }

      if (videoRef.current && videoRef.current.readyState >= 2 && handLandmarker) {
        const startTimeMs = performance.now();
        const now = Date.now();
        
        // Gesture cooldown to prevent rapid triggers
        if (now - gestureCooldownRef.current < 150) {
          animationFrameId = requestAnimationFrame(renderLoop);
          return;
        }

        if (lastVideoTime !== videoRef.current.currentTime) {
          lastVideoTime = videoRef.current.currentTime;
          const results = handLandmarker.detectForVideo(videoRef.current, startTimeMs);

          if (results.landmarks && results.landmarks.length > 0) {

            // Check for Two Hands -> Panning Mode
            if (results.landmarks.length === 2) {
              const newGesture = 'Both Palms Detected (Panning)';
              if (newGesture !== lastGestureRef.current) {
                setGesture(newGesture);
                lastGestureRef.current = newGesture;
                gestureCooldownRef.current = now;
              }
              
              const hand1 = results.landmarks[0][0];
              const hand2 = results.landmarks[1][0];

              const avgX = ((1 - hand1.x) + (1 - hand2.x)) / 2 * window.innerWidth;
              const avgY = (hand1.y + hand2.y) / 2 * window.innerHeight;

              if (!panState.current.isPanning) {
                panState.current.isPanning = true;
                panState.current.lastHandsX = avgX;
                panState.current.lastHandsY = avgY;
              } else {
                const dx = avgX - panState.current.lastHandsX;
                const dy = avgY - panState.current.lastHandsY;

                panState.current.x += dx * 1.5;
                panState.current.y += dy * 1.5;

                panState.current.lastHandsX = avgX;
                panState.current.lastHandsY = avgY;

                setPanOffset({ x: panState.current.x, y: panState.current.y });
              }

              isDrawing.current = false;
            } else {
              // Single Hand -> Pointer/Marker/Eraser
              panState.current.isPanning = false;

              const landmarks = results.landmarks[0];
              const indexTip = landmarks[8];
              const thumbTip = landmarks[4];
              const middleTip = landmarks[12];
              const wrist = landmarks[0];

              const screenX = (1 - indexTip.x) * window.innerWidth;
              const screenY = indexTip.y * window.innerHeight;

              // Smooth cursor movement
              setCursorPos(prev => ({
                x: prev.x < 0 ? screenX : prev.x * 0.75 + screenX * 0.25,
                y: prev.y < 0 ? screenY : prev.y * 0.75 + screenY * 0.25
              }));

              const distance = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
              const isPinching = distance < 0.05;
              
              // Detect closed fist (all fingers curled)
              const isFist = landmarks.every((point: any) => point.y > wrist.y);

              const isDrawingActive = currentTool.current === 'marker' ? true : isPinching;

              if (currentTool.current === 'pointer') {
                const hoveredEl = document.elementFromPoint(screenX, screenY);
                const nodeEl = hoveredEl?.closest('.react-flow__node');

                document.querySelectorAll('.jarvis-highlight').forEach(el => el.classList.remove('ring-2', 'ring-cyan-400', 'jarvis-highlight'));
                let hoveredNodeData = null;
                if (nodeEl) {
                  nodeEl.classList.add('ring-2', 'ring-cyan-400', 'jarvis-highlight');
                  hoveredNodeData = {
                    type: 'Graph Node',
                    content: nodeEl.textContent || 'Unknown Data'
                  };
                }

                if (isFist && now - lastActionRef.current > 500) {
                  // Action: Open source or activate selected node
                  setGesture('Closed Fist: Activating');
                  lastActionRef.current = now;
                  gestureCooldownRef.current = now;
                  
                  if (selectedGraphItem?.type === 'source' && selectedGraphItem.source?.url) {
                    window.open(selectedGraphItem.source.url, '_blank');
                  }
                } else if (isPinching) {
                  if (screenX < window.innerWidth * 0.3) {
                    const newGesture = 'Pinch: Grabbing Node';
                    if (newGesture !== lastGestureRef.current) {
                      setGesture(newGesture);
                      lastGestureRef.current = newGesture;
                    }
                    if (!draggingNodeRef.current && hoveredNodeData) {
                      draggingNodeRef.current = hoveredNodeData;
                    }
                  } else {
                    const newGesture = 'Pinch: Dragging';
                    if (newGesture !== lastGestureRef.current) {
                      setGesture(newGesture);
                      lastGestureRef.current = newGesture;
                    }
                  }
                } else {
                  const newGesture = 'Open Palm: Hover';
                  if (newGesture !== lastGestureRef.current) {
                    setGesture(newGesture);
                    lastGestureRef.current = newGesture;
                  }
                  if (draggingNodeRef.current && screenX > window.innerWidth * 0.3) {
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (rect) {
                      const dropX = screenX - rect.left;
                      const dropY = screenY - rect.top;
                      setPlacedNodes(prev => [...prev, { 
                        id: `n-${Date.now()}`, 
                        x: dropX, 
                        y: dropY, 
                        data: draggingNodeRef.current,
                        isUserCreated: true 
                      }]);
                    }
                  }
                  draggingNodeRef.current = null;
                }
              } else if (currentTool.current === 'marker') {
                const newGesture = 'Marker: Drawing';
                if (newGesture !== lastGestureRef.current) {
                  setGesture(newGesture);
                  lastGestureRef.current = newGesture;
                }
                drawOnCanvas(screenX, screenY, isDrawingActive);
              } else if (currentTool.current === 'eraser') {
                const newGesture = isPinching ? 'Eraser: Erasing' : 'Eraser: Hover';
                if (newGesture !== lastGestureRef.current) {
                  setGesture(newGesture);
                  lastGestureRef.current = newGesture;
                }
                drawOnCanvas(screenX, screenY, isDrawingActive);
              }
            }
          } else {
            const newGesture = 'No Hands Detected';
            if (newGesture !== lastGestureRef.current) {
              setGesture(newGesture);
              lastGestureRef.current = newGesture;
            }
            setCursorPos({ x: -100, y: -100 });
            isDrawing.current = false;
            panState.current.isPanning = false;
          }
        }
      }
      animationFrameId = requestAnimationFrame(renderLoop);
    };

    videoRef.current?.addEventListener('loadeddata', renderLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (handLandmarker) handLandmarker.close();
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [handTrackingEnabled]);

  const handleExport = useCallback(async () => {
    if (containerRef.current) {
      setGesture('Exporting Snapshot...');
      try {
        const canvas = await html2canvas(containerRef.current, { backgroundColor: '#0a0a0a' });
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `Vikaas_Jarvis_Notebook_${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
        setGesture('Export Complete');
      } catch (e) {
        console.error(e);
        setGesture('Export Failed');
      }
    }
  }, []);

  const handleDeleteUserNode = (nodeId: string) => {
    const node = placedNodes.find(n => n.id === nodeId);
    if (node && node.isUserCreated) {
      setPlacedNodes(prev => prev.filter(n => n.id !== nodeId));
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
    <div className="fixed inset-0 z-50 bg-neutral-950 text-cyan-500 overflow-hidden font-mono selection:bg-cyan-900/20 selection:text-cyan-200 flex flex-col transition-opacity duration-500"
         style={{ opacity: isTransitioning ? 0.3 : 1 }}
    >
      {/* Cinematic Dim Overlay */}
      {isTransitioning && (
        <div className="absolute inset-0 bg-black z-[100] pointer-events-none transition-opacity duration-500" />
      )}

        {/* JARVIS HUD - Top Bar */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-[200] pointer-events-none">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-cyan-400" />
              <div>
                <h1 className="text-sm font-bold tracking-widest text-cyan-400 uppercase">J.A.R.V.I.S.</h1>
                <p className="text-[10px] text-cyan-600">RESEARCH ARENA</p>
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
                {isCameraActive ? 'CAMERA ONLINE' : 'CAMERA OFFLINE'}
              </span>
            </div>

            {/* Hand Tracking Status */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-900/80 border border-neutral-800 backdrop-blur-sm ${handTrackingEnabled ? 'text-cyan-400' : 'text-neutral-500'}`}>
              <Crosshair className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase">
                {handTrackingEnabled ? 'HAND TRACKING ACTIVE' : 'HAND TRACKING DISABLED'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Gesture Display */}
            <div className="bg-neutral-900/80 border border-neutral-800 px-3 py-1.5 rounded text-[10px] text-cyan-300 font-bold uppercase backdrop-blur-sm">
              {gesture}
            </div>

            {/* Exit Button */}
            <button
              onClick={onExit}
              className="pointer-events-auto px-4 py-2 bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 text-[10px] font-bold rounded-lg transition-all cursor-pointer backdrop-blur-sm"
            >
              EXIT [ESC]
            </button>
          </div>
        </div>

        {/* JARVIS Toolbar - Left */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-[200]">
          <button 
            onClick={() => setTool('pointer')} 
            className={`p-2.5 rounded-lg border transition-all backdrop-blur-md ${tool === 'pointer' ? 'bg-cyan-900/60 border-cyan-600 text-cyan-300' : 'bg-neutral-900/80 border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-300'}`} 
            title="Pointer Tool [1]"
          >
            <MousePointer2 className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setTool('marker')} 
            className={`p-2.5 rounded-lg border transition-all backdrop-blur-md ${tool === 'marker' ? 'bg-cyan-900/60 border-cyan-600 text-cyan-300' : 'bg-neutral-900/80 border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-300'}`} 
            title="Marker Tool [2]"
          >
            <PenTool className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setTool('eraser')} 
            className={`p-2.5 rounded-lg border transition-all backdrop-blur-md ${tool === 'eraser' ? 'bg-cyan-900/60 border-cyan-600 text-cyan-300' : 'bg-neutral-900/80 border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-300'}`} 
            title="Eraser Tool [3]"
          >
            <Eraser className="w-4 h-4" />
          </button>
          <div className="h-px bg-neutral-800 my-1 w-full" />
          <button 
            onClick={() => setHandTrackingEnabled(!handTrackingEnabled)} 
            className={`p-2.5 rounded-lg border transition-all backdrop-blur-md ${handTrackingEnabled ? 'bg-cyan-900/60 border-cyan-600 text-cyan-300' : 'bg-neutral-900/80 border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-300'}`} 
            title="Toggle Hand Tracking [M]"
          >
            {handTrackingEnabled ? <Crosshair className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
          </button>
          <button 
            onClick={playJarvisGreeting} 
            className={`p-2.5 rounded-lg border transition-all backdrop-blur-md ${voiceStatus === 'playing' ? 'bg-emerald-900/60 border-emerald-600 text-emerald-300' : 'bg-neutral-900/80 border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-300'}`} 
            title="Test Voice [V]"
          >
            {voiceStatus === 'playing' ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <div className="h-px bg-neutral-800 my-1 w-full" />
          <button 
            onClick={() => setPanOffset({ x: 0, y: 0 })} 
            className="p-2.5 rounded-lg bg-neutral-900/80 border border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-300 transition-all backdrop-blur-md" 
            title="Reset Layout [R]"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button 
            onClick={handleExport} 
            className="p-2.5 rounded-lg bg-neutral-900/80 border border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-300 transition-all backdrop-blur-md" 
            title="Export Snapshot"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>

        {/* Hidden Video for tracking */}
        <video ref={videoRef} className="hidden" playsInline muted />

        {/* Custom Hand Cursor */}
        {isCameraActive && cursorPos.x >= 0 && (
          <div
            className="fixed pointer-events-none z-[300] transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-transform duration-200"
            style={{ left: cursorPos.x, top: cursorPos.y }}
          >
            {tool === 'pointer' && <Crosshair className="w-5 h-5 text-cyan-400 opacity-70" />}
            {tool === 'marker' && <PenTool className="w-4 h-4 text-cyan-400 fill-cyan-400/30" />}
            {tool === 'eraser' && <div className="w-8 h-8 border-2 border-dashed border-rose-400/60 rounded-full bg-rose-500/10" />}
          </div>
        )}

        {/* Fullscreen Research Graph */}
        <div className="flex-1 w-full h-full flex p-4 pt-20 gap-4">
          <div className="flex-1 h-full rounded-xl border border-neutral-800/50 overflow-hidden relative bg-neutral-950/90">
            <ResearchGraph
              state={state}
              isStatic={false}
              onSelectItem={useCallback((item: any) => {
                setSelectedGraphItem(item);
                setSelectedNodeData(item);
                onSelectItem(item);
              }, [onSelectItem])}
            />
            <div className="absolute top-3 left-3 text-[10px] text-neutral-500 bg-neutral-900/90 px-2 py-1 rounded font-mono">
              LIVE RESEARCH GRAPH
            </div>
            <div className="absolute bottom-3 left-3 text-[10px] text-neutral-600 bg-neutral-900/90 px-2 py-1 rounded font-mono">
              [F] Fit to Screen · Mouse fallback enabled
            </div>
          </div>

          {/* Side Panel for Workspace */}
          <div
            className="w-80 h-full rounded-xl border border-neutral-800/50 bg-neutral-950/90 relative overflow-hidden"
            style={{ cursor: tool === 'marker' ? 'crosshair' : tool === 'eraser' ? 'cell' : 'default' }}
          >
            <div className="absolute top-3 left-3 text-[10px] text-neutral-500 bg-neutral-900/90 px-2 py-1 rounded font-mono z-[160]">
              WORKSPACE
            </div>

            <div
              ref={containerRef}
              className="absolute w-[300vw] h-[300vh] left-[-100vw] top-[-100vh] will-change-transform transition-transform duration-75"
              style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }}
            >
              <canvas
                ref={canvasRef}
                className="absolute inset-0 pointer-events-none z-[150]"
              />

              {placedNodes.map(node => (
                <div
                  key={node.id}
                  className="absolute bg-neutral-900/95 border border-neutral-700 p-3 rounded-lg shadow-lg w-64 z-[140] group"
                  style={{ left: node.x, top: node.y }}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-[10px] font-bold text-cyan-400 border-b border-neutral-800 pb-1">
                      {node.data.type?.toUpperCase() || 'NOTE'}
                    </div>
                    {node.isUserCreated && (
                      <button
                        onClick={() => handleDeleteUserNode(node.id)}
                        className="text-neutral-500 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div className="text-[9px] text-neutral-300 overflow-hidden break-words max-h-32 custom-scrollbar">
                    {typeof node.data === 'string' ? node.data : JSON.stringify(node.data, null, 2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Inspector Overlay */}
        {selectedNodeData && (
          <div className="absolute bottom-4 right-4 w-80 bg-neutral-950/95 border border-neutral-800 p-4 rounded-xl backdrop-blur-md shadow-xl pointer-events-auto z-[250] transition-all duration-300">
            <div className="flex justify-between items-center mb-3 border-b border-neutral-800 pb-2">
              <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5" />
                INSPECTOR
              </h3>
              <button onClick={() => setSelectedNodeData(null)} className="text-neutral-500 hover:text-neutral-300 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-[10px] text-neutral-300 space-y-2 overflow-y-auto max-h-48 custom-scrollbar">
              <pre className="whitespace-pre-wrap font-mono leading-relaxed">
                {JSON.stringify(selectedNodeData, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
  );
}
