import React, { useState, useRef, useEffect } from 'react';
import ToolFAQ from './components/ToolFAQ';

import BrandedNav from './components/BrandedNav';
import BrandedFooter from './components/BrandedFooter';
import { 
  Upload, Play, Pause, Volume2, VolumeX,
  Settings, Music, SkipBack, SkipForward, Repeat,
  Loader2, CheckCircle2, AlertCircle, AlertTriangle, Download
} from 'lucide-react';
import { useToolUsage } from './hooks/useToolUsage';

export default function AudioExtractor() {
  const { checkUsage, incrementUsage } = useToolUsage();

  const faqs = [
    {
      "question": "What formats does it support?",
      "answer": "You can upload almost any video format (MP4, MOV, WebM, etc.) and we will extract the audio track and convert it into a universal MP3 file."
    },
    {
      "question": "What bitrate should I choose?",
      "answer": "128 kbps is standard and great for spoken word (podcasts, lectures). 192 kbps is high quality, and 320 kbps is 'studio' quality (best for music videos)."
    },
    {
      "question": "Are my files uploaded to a server?",
      "answer": "No, all processing happens locally on your device. Your videos never leave your browser, ensuring complete privacy."
    },
    {
      "question": "Will this work offline?",
      "answer": "Yes! Because the engine runs directly inside your web browser via WebAssembly, it can extract audio even if you disconnect from the internet after loading the page."
    }
  ];

  const [bitrate, setBitrate] = useState('192');
  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  
  // Video state
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isLooping, setIsLooping] = useState(true);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [loadingMsg, setLoadingMsg] = useState('Booting Engine...');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [resultUrl, setResultUrl] = useState(null);
  const [downloadFileName, setDownloadFileName] = useState("");

  const ffmpegRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const loadStarted = useRef(false);

  useEffect(() => {
    if (loadStarted.current) return;
    loadStarted.current = true;

    const loadFFmpeg = async () => {
      try {
        setLoadingMsg("Fetching Engine...");
        const { createFFmpeg } = window.FFmpeg;
        const ffmpeg = createFFmpeg({
           log: true,
           corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
        });
        ffmpegRef.current = ffmpeg;
        await ffmpeg.load();
        setIsReady(true);
        setLoadingMsg('Engine Loaded');
        setError(null);
      } catch (err) {
        console.error("FFmpeg load error:", err);
        setError("Error: " + (err.message || "Failed to initialize WebAssembly."));
        setLoadingMsg("Failed to Load");
      }
    };
    
    setTimeout(() => {
        if (window.FFmpeg) {
            loadFFmpeg();
        } else {
            setError("Global FFmpeg library failed to inject.");
        }
    }, 500);
  }, []);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type.startsWith('video/')) {
      setFile(selectedFile);
      const url = URL.createObjectURL(selectedFile);
      setVideoUrl(url);
      setError(null);
    } else {
        setError('Please upload a valid video file.');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith('video/')) {
      setFile(droppedFile);
      const url = URL.createObjectURL(droppedFile);
      setVideoUrl(url);
      setError(null);
    } else {
        setError('Please upload a valid video file.');
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const p = (videoRef.current.currentTime / videoRef.current.duration) * 100;
      setProgress(p);
    }
  };

  const handleScrub = (e) => {
    if (videoRef.current) {
      const scrubTime = (e.target.value / 100) * videoRef.current.duration;
      videoRef.current.currentTime = scrubTime;
      setProgress(e.target.value);
    }
  };

  const stepFrame = (forward) => {
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
      videoRef.current.currentTime += forward ? 0.033 : -0.033;
    }
  };

  const handleProcess = async () => {
    if (!checkUsage()) {
      setError("Daily limit reached. Free users can process tools 3 times a day. Please upgrade for unlimited access.");
      return;
    }
    incrementUsage();

    if (!file || !isReady) return;

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setResultUrl(null);
    setProcessProgress(0);
    setDownloadFileName(file.name.substring(0, file.name.lastIndexOf('.')) || file.name);

    try {
      const ffmpeg = ffmpegRef.current;
      const { fetchFile } = window.FFmpeg;
      
      setLoadingMsg('Uploading to virtual filesystem...');
      ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));

      setLoadingMsg('Extracting and encoding MP3...');
      
      let progressVal = 0;
      let interval = setInterval(() => {
         progressVal = Math.min(progressVal + 2, 90);
         setProcessProgress(progressVal);
      }, 500);
      
      await ffmpeg.run(
        '-i', 'input.mp4',
        '-vn', 
        '-c:a', 'libmp3lame',
        '-b:a', `${bitrate}k`,
        'output.mp3'
      );

      clearInterval(interval);
      setProcessProgress(100);
      setLoadingMsg("Finalizing download...");

      const data = ffmpeg.FS('readFile', 'output.mp3');
      const url = window.URL.createObjectURL(new Blob([data.buffer], { type: 'audio/mp3' }));
      
      setResultUrl(url);
      const sizeMB = (data.buffer.byteLength / (1024 * 1024)).toFixed(2);
      
      setResult({ message: `Success! Audio extracted to MP3 (${sizeMB}MB)` });

      ffmpeg.FS('unlink', 'input.mp4');
      ffmpeg.FS('unlink', 'output.mp3');

    } catch (err) {
      console.error(err);
      setError(err.message || 'An error occurred during extraction.');
    } finally {
      setIsProcessing(false);
      setProcessProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white p-6 md:p-12">
      
      <BrandedNav />
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-3">
              <Music className="text-cyan-500" /> Audio Extractor
            </h1>
            <p className="text-gray-400 font-medium">Convert any video to MP3 instantly</p>
          </div>
          {videoUrl && !isProcessing && (
            <button 
              onClick={() => { setFile(null); setVideoUrl(null); setResult(null); setError(null); }}
              className="px-6 py-2 bg-white/5 hover:bg-white/10 rounded-full font-bold text-sm transition-colors border border-white/10"
            >
              Upload New Video
            </button>
          )}
        </div>

        {!videoUrl ? (
          <div 
            className="w-full max-w-3xl mx-auto h-[60vh] border-2 border-dashed border-white/10 rounded-[2rem] flex flex-col items-center justify-center p-8 text-center hover:bg-white/5 hover:border-cyan-500/50 transition-all cursor-pointer group"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <input 
              type="file" 
              id="video-input" 
              accept="video/*" 
              className="hidden" 
              onChange={handleFileChange}
            />
            <label htmlFor="video-input" className="cursor-pointer flex flex-col items-center w-full h-full justify-center">
              <div className="w-20 h-20 bg-cyan-500/10 text-cyan-500 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Upload size={32} />
              </div>
              <h2 className="text-2xl font-black mb-2">Select a Video</h2>
              <p className="text-gray-400 max-w-sm">Drag and drop your .mp4 or .mov file here to extract audio.</p>
              <div className="mt-8 px-4 py-2 bg-white/5 rounded-full text-xs font-bold text-gray-500 uppercase tracking-widest">
                Local Processing • Zero Uploads
              </div>
            </label>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Main Preview Area */}
            <div className="flex-1 flex flex-col items-center">
              <div className="w-full bg-black rounded-3xl border border-white/10 shadow-2xl overflow-hidden shrink-0 aspect-video flex items-center justify-center">
                <video 
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full object-contain bg-zinc-900"
                  onTimeUpdate={handleTimeUpdate}
                  loop={isLooping}
                  muted={isMuted}
                  playsInline
                />
              </div>

              {/* Transport Controls */}
              <div className="w-full mt-6 bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-md">
                <div className="flex items-center justify-between mb-4">
                  <button onClick={() => stepFrame(false)} className="p-2 text-gray-400 hover:text-white"><SkipBack size={20} /></button>
                  <button onClick={togglePlay} className="w-12 h-12 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform">
                    {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
                  </button>
                  <button onClick={() => stepFrame(true)} className="p-2 text-gray-400 hover:text-white"><SkipForward size={20} /></button>
                </div>
                
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={progress}
                  onChange={handleScrub}
                  className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                
                <div className="flex justify-between mt-4">
                  <button onClick={() => setIsMuted(!isMuted)} className={`p-2 rounded-lg ${isMuted ? 'text-red-400 bg-red-400/10' : 'text-gray-400 hover:text-white'}`}>
                    {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                  <button onClick={() => setIsLooping(!isLooping)} className={`p-2 rounded-lg ${isLooping ? 'text-cyan-400 bg-cyan-400/10' : 'text-gray-400 hover:text-white'}`}>
                    <Repeat size={18} />
                  </button>
                </div>
              </div>
            </div>

            {/* Sidebar Settings */}
            <div className="w-full lg:w-[350px] space-y-6">
              
              <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4 flex items-start gap-3">
                 <AlertTriangle className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                 <div className="text-cyan-200 text-xs">
                   <span className="font-bold text-cyan-400">Privacy Notice:</span> 
                   Your audio is extracted purely on your device. Nothing leaves your browser.
                </div>
              </div>

              {/* Settings */}
              {!result && !isProcessing && (
                <div className="glass-card p-6 rounded-3xl border border-white/10 bg-white/5">
                  <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                    <Settings size={16} /> Encoding Quality
                  </h3>
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => setBitrate('128')}
                      className={`py-3 rounded-xl font-bold flex flex-col items-center justify-center gap-1 text-sm transition-all border ${bitrate === '128' ? 'bg-cyan-600 border-cyan-500 text-white shadow-lg shadow-cyan-500/20' : 'bg-black/40 border-white/10 text-gray-400 hover:border-white/30 hover:text-white'}`}
                    >
                      <span>128 kbps</span>
                      <span className="text-xs font-normal opacity-70">Standard (Podcasts)</span>
                    </button>
                    <button 
                      onClick={() => setBitrate('192')}
                      className={`py-3 rounded-xl font-bold flex flex-col items-center justify-center gap-1 text-sm transition-all border ${bitrate === '192' ? 'bg-cyan-600 border-cyan-500 text-white shadow-lg shadow-cyan-500/20' : 'bg-black/40 border-white/10 text-gray-400 hover:border-white/30 hover:text-white'}`}
                    >
                      <span>192 kbps</span>
                      <span className="text-xs font-normal opacity-70">High Quality</span>
                    </button>
                    <button 
                      onClick={() => setBitrate('320')}
                      className={`py-3 rounded-xl font-bold flex flex-col items-center justify-center gap-1 text-sm transition-all border ${bitrate === '320' ? 'bg-cyan-600 border-cyan-500 text-white shadow-lg shadow-cyan-500/20' : 'bg-black/40 border-white/10 text-gray-400 hover:border-white/30 hover:text-white'}`}
                    >
                      <span>320 kbps</span>
                      <span className="text-xs font-normal opacity-70">Studio (Music)</span>
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-red-200 text-sm">{error}</p>
                </div>
              )}

              {result && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm font-medium text-emerald-300 mb-4">{result.message}</p>
                  <div className="flex flex-col gap-3">
                    {resultUrl && (
                      <a 
                        href={resultUrl} 
                        download={`${downloadFileName}.mp3`}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all text-sm"
                      >
                        <Download size={16} />
                        Download MP3
                      </a>
                    )}
                  </div>
                </div>
              )}

              {!result && (
                <button 
                  onClick={handleProcess}
                  disabled={isProcessing || !isReady}
                  className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl transition-all flex flex-col items-center justify-center gap-2 transform relative overflow-hidden ${
                    isProcessing || !isReady
                      ? 'bg-white/10 text-white/50 cursor-not-allowed'
                      : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-600/20 hover:-translate-y-1'
                  }`}
                >
                  {isProcessing && (
                    <div 
                      className="absolute left-0 top-0 bottom-0 bg-white/20 transition-all duration-300"
                      style={{ width: `${processProgress}%` }}
                    ></div>
                  )}
                  
                  <div className="relative flex items-center gap-2">
                    {(isProcessing || !isReady) ? <Loader2 size={18} className="animate-spin" /> : <Music size={18} />}
                    {isProcessing || !isReady ? loadingMsg : 'Extract Audio'}
                  </div>
                </button>
              )}

            </div>
          </div>
        )}
      </div>

      {/* SEO Sections */}
      <div className="mt-24 space-y-24 max-w-4xl mx-auto px-4">
        {/* How It Works */}
        <section>
          <h2 className="text-3xl font-bold mb-8 text-center">How to Extract Audio from Video</h2>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 relative">
              <div className="absolute -top-4 -left-4 w-10 h-10 bg-cyan-600 rounded-full flex items-center justify-center font-bold text-xl shadow-lg shadow-cyan-500/20">1</div>
              <h3 className="text-xl font-bold mb-3 text-cyan-400 mt-2">Upload Video</h3>
              <p className="text-gray-400">Select any video file directly from your computer or drag and drop it into the zone.</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 relative">
              <div className="absolute -top-4 -left-4 w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center font-bold text-xl shadow-lg shadow-blue-500/20">2</div>
              <h3 className="text-xl font-bold mb-3 text-blue-400 mt-2">Set Quality</h3>
              <p className="text-gray-400">Choose between Standard, High Quality, and Studio bitrates for your final MP3 file.</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 relative">
              <div className="absolute -top-4 -left-4 w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center font-bold text-xl shadow-lg shadow-indigo-500/20">3</div>
              <h3 className="text-xl font-bold mb-3 text-indigo-400 mt-2">Extract</h3>
              <p className="text-gray-400">Hit extract and let our WebAssembly engine pull the audio track directly in your browser.</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 relative">
              <div className="absolute -top-4 -left-4 w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center font-bold text-xl shadow-lg shadow-purple-500/20">4</div>
              <h3 className="text-xl font-bold mb-3 text-purple-400 mt-2">Download</h3>
              <p className="text-gray-400">Save your new, high-quality MP3 file directly to your hard drive.</p>
            </div>
          </div>
        </section>

        {/* Feature Breakdown */}
        <section>
          <h2 className="text-3xl font-bold mb-8 text-center">Why Use Our Audio Extractor?</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-[#0f172a] rounded-2xl p-8 border border-white/5">
              <h3 className="text-2xl font-bold mb-4">Privacy First</h3>
              <p className="text-gray-400">Everything runs natively in your browser using WebAssembly. No servers, no uploads, and no data tracking.</p>
            </div>
            <div className="bg-[#0f172a] rounded-2xl p-8 border border-white/5">
              <h3 className="text-2xl font-bold mb-4">Blazing Fast</h3>
              <p className="text-gray-400">Because files aren't uploaded, extraction is instantaneous compared to traditional cloud tools.</p>
            </div>
            <div className="bg-[#0f172a] rounded-2xl p-8 border border-white/5">
              <h3 className="text-2xl font-bold mb-4">Lossless MP3 Encoding</h3>
              <p className="text-gray-400">Advanced conversion parameters guarantee you get the best sounding audio track possible.</p>
            </div>
            <div className="bg-[#0f172a] rounded-2xl p-8 border border-white/5">
              <h3 className="text-2xl font-bold mb-4">Universal Format</h3>
              <p className="text-gray-400">We output standard MP3 files, ensuring complete compatibility across phones, cars, and software.</p>
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section>
          <h2 className="text-3xl font-bold mb-8 text-center">Built for Content Creators & Professionals</h2>
          <div className="space-y-6">
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10 flex flex-col md:flex-row gap-6 items-center">
              <div className="md:w-1/3">
                <h3 className="text-xl font-bold mb-2">Podcasters</h3>
              </div>
              <div className="md:w-2/3">
                <p className="text-gray-400">Easily rip audio from video interviews or zoom calls to use in your next audio podcast release.</p>
              </div>
            </div>
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10 flex flex-col md:flex-row gap-6 items-center">
              <div className="md:w-1/3">
                <h3 className="text-xl font-bold mb-2">Musicians & DJs</h3>
              </div>
              <div className="md:w-2/3">
                <p className="text-gray-400">Extract vocal tracks, live performances, or samples from music videos efficiently without losing fidelity.</p>
              </div>
            </div>
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10 flex flex-col md:flex-row gap-6 items-center">
              <div className="md:w-1/3">
                <h3 className="text-xl font-bold mb-2">Students & Educators</h3>
              </div>
              <div className="md:w-2/3">
                <p className="text-gray-400">Save space by converting long video lectures and tutorials into smaller audio files for listening on the go.</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <ToolFAQ faqs={faqs} />
      <BrandedFooter />
    </div>
  );
}
