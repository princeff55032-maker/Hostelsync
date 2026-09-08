'use client';

// Web Audio API engine for real metronome ticks, spatial audio processing, and studio music filters
class AudioEngine {
  private ctx: AudioContext | null = null;
  private metronomeTimer: any = null;
  private isMetronomeRunning: boolean = false;
  private metronomeBpm: number = 120;

  // Media element processing pipeline
  private mediaSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  private lowPassFilter: BiquadFilterNode | null = null;
  private highPassFilter: BiquadFilterNode | null = null;
  private bassFilter: BiquadFilterNode | null = null;
  private trebleFilter: BiquadFilterNode | null = null;
  private pannerNode: StereoPannerNode | null = null;
  private masterGain: GainNode | null = null;
  private isPipelineActive: boolean = false;

  private getContext(): AudioContext {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public unlockAudio(): void {
    try {
      const ctx = this.getContext();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {}
  }

  // Ensure audio filters pipeline is built
  private ensurePipeline(): void {
    if (this.isPipelineActive) return;
    const ctx = this.getContext();

    // 1. Low-Pass Filter (removes high frequencies, muffled/room effect)
    this.lowPassFilter = ctx.createBiquadFilter();
    this.lowPassFilter.type = 'lowpass';
    this.lowPassFilter.frequency.setValueAtTime(20000, ctx.currentTime);

    // 2. High-Pass Filter (removes low rumble, crisp telephone/radio effect)
    this.highPassFilter = ctx.createBiquadFilter();
    this.highPassFilter.type = 'highpass';
    this.highPassFilter.frequency.setValueAtTime(20, ctx.currentTime);

    // 3. Bass EQ Shelf
    this.bassFilter = ctx.createBiquadFilter();
    this.bassFilter.type = 'lowshelf';
    this.bassFilter.frequency.setValueAtTime(250, ctx.currentTime);
    this.bassFilter.gain.setValueAtTime(0, ctx.currentTime);

    // 4. Treble EQ Shelf
    this.trebleFilter = ctx.createBiquadFilter();
    this.trebleFilter.type = 'highshelf';
    this.trebleFilter.frequency.setValueAtTime(4000, ctx.currentTime);
    this.trebleFilter.gain.setValueAtTime(0, ctx.currentTime);

    // 5. Stereo Panner (-1.0 to +1.0)
    if (typeof ctx.createStereoPanner === 'function') {
      this.pannerNode = ctx.createStereoPanner();
      this.pannerNode.pan.setValueAtTime(0, ctx.currentTime);
    }

    // 6. Master Gain Node
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(1.0, ctx.currentTime);

    // Chain: LowPass -> HighPass -> Bass -> Treble -> (Panner) -> Gain -> Destination
    let lastNode: AudioNode = this.lowPassFilter;
    lastNode.connect(this.highPassFilter);
    lastNode = this.highPassFilter;

    lastNode.connect(this.bassFilter);
    lastNode = this.bassFilter;

    lastNode.connect(this.trebleFilter);
    lastNode = this.trebleFilter;

    if (this.pannerNode) {
      lastNode.connect(this.pannerNode);
      lastNode = this.pannerNode;
    }

    lastNode.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);

    this.isPipelineActive = true;
  }

  private streamDestination: MediaStreamAudioDestinationNode | null = null;

  // Get live WebRTC stream of audio pipeline output for real-time peer streaming
  public getOutputStream(): MediaStream | null {
    try {
      const ctx = this.getContext();
      this.ensurePipeline();
      if (!this.streamDestination && this.masterGain) {
        this.streamDestination = ctx.createMediaStreamDestination();
        this.masterGain.connect(this.streamDestination);
      }
      return this.streamDestination ? this.streamDestination.stream : null;
    } catch {
      return null;
    }
  }

  // Connect an HTML5 <audio> element to the studio filter pipeline
  public attachMediaElement(element: HTMLAudioElement): void {
    try {
      const ctx = this.getContext();
      this.ensurePipeline();

      if (!this.lowPassFilter) return;

      let sourceNode = this.mediaSources.get(element);
      if (!sourceNode) {
        sourceNode = ctx.createMediaElementSource(element);
        this.mediaSources.set(element, sourceNode);
        sourceNode.connect(this.lowPassFilter);
      }
    } catch {
      // Element might already be connected
    }
  }

  // Set real-time studio audio filters and spatial panning
  public setSpatialFilterParams(params: {
    volumeMultiplier?: number;
    pan?: number;
    lowPassHz?: number;
    highPassHz?: number;
    bassGainDb?: number;
    trebleGainDb?: number;
  }) {
    try {
      const ctx = this.getContext();
      this.ensurePipeline();
      const now = ctx.currentTime;

      // Master spatial gain
      if (this.masterGain && typeof params.volumeMultiplier === 'number') {
        this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1.5, params.volumeMultiplier)), now, 0.05);
      }

      // Stereo pan (-1 left to +1 right)
      if (this.pannerNode && typeof params.pan === 'number') {
        this.pannerNode.pan.setTargetAtTime(Math.max(-1, Math.min(1, params.pan)), now, 0.05);
      }

      // Low-pass frequency (200Hz to 20000Hz)
      if (this.lowPassFilter && typeof params.lowPassHz === 'number') {
        const freq = Math.max(200, Math.min(20000, params.lowPassHz));
        this.lowPassFilter.frequency.setTargetAtTime(freq, now, 0.05);
      }

      // High-pass frequency (20Hz to 3000Hz)
      if (this.highPassFilter && typeof params.highPassHz === 'number') {
        const freq = Math.max(20, Math.min(3000, params.highPassHz));
        this.highPassFilter.frequency.setTargetAtTime(freq, now, 0.05);
      }

      // Bass EQ (-15dB to +15dB)
      if (this.bassFilter && typeof params.bassGainDb === 'number') {
        this.bassFilter.gain.setTargetAtTime(params.bassGainDb, now, 0.05);
      }

      // Treble EQ (-15dB to +15dB)
      if (this.trebleFilter && typeof params.trebleGainDb === 'number') {
        this.trebleFilter.gain.setTargetAtTime(params.trebleGainDb, now, 0.05);
      }
    } catch {
      // Ignore audio parameter errors before user gesture
    }
  }

  // Explicitly resume audio context on user interaction
  public resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  // Play an acoustic preview cue through the active filter chain so user hears the effect immediately
  public previewFilterCue(presetId?: string): void {
    try {
      const ctx = this.getContext();
      this.ensurePipeline();
      if (!this.lowPassFilter) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (presetId === 'bass') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(90, ctx.currentTime);
        gain.gain.setValueAtTime(0.001, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.38);
      } else if (presetId === 'nextdoor') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(120, ctx.currentTime);
        gain.gain.setValueAtTime(0.001, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
      } else if (presetId === 'lofi') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(260, ctx.currentTime);
        gain.gain.setValueAtTime(0.001, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      } else if (presetId === 'vocal') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, ctx.currentTime);
        gain.gain.setValueAtTime(0.001, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
      } else if (presetId === 'club') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, ctx.currentTime);
        gain.gain.setValueAtTime(0.001, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      } else {
        // Flat
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.001, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      }

      // Route through the real lowPassFilter so the active filters are 100% applied!
      osc.connect(gain);
      gain.connect(this.lowPassFilter);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.42);
    } catch {}
  }

  // Play a single crisp metronome click/tick
  public playClick(highPitch: boolean = false) {
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(highPitch ? 1200 : 800, ctx.currentTime);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch {}
  }

  // Start continuous rhythmic metronome sync pulse
  public startMetronome(onTick?: (beat: number) => void) {
    if (this.isMetronomeRunning) return;
    this.isMetronomeRunning = true;

    let beat = 0;
    const intervalMs = (60 / this.metronomeBpm) * 1000;

    this.playClick(true);
    if (onTick) onTick(0);

    this.metronomeTimer = setInterval(() => {
      beat = (beat + 1) % 4;
      this.playClick(beat === 0);
      if (onTick) onTick(beat);
    }, intervalMs);
  }

  // Stop metronome
  public stopMetronome() {
    this.isMetronomeRunning = false;
    if (this.metronomeTimer) {
      clearInterval(this.metronomeTimer);
      this.metronomeTimer = null;
    }
  }

  public toggleMetronome(onTick?: (beat: number) => void): boolean {
    if (this.isMetronomeRunning) {
      this.stopMetronome();
      return false;
    } else {
      this.startMetronome(onTick);
      return true;
    }
  }

  // Generate warm relaxing chord synthesizer sound for default tracks
  public playAmbientChord(volume: number = 0.5) {
    try {
      const ctx = this.getContext();
      const freqs = [261.63, 329.63, 392.0, 523.25]; // C major 7th chord frequencies

      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq + (i * 0.5), ctx.currentTime);

        const currentVol = (volume / 100) * 0.15;
        gain.gain.setValueAtTime(0.001, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(currentVol, ctx.currentTime + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3.0);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 3.0);
      });
    } catch {}
  }
}

export const audioEngine = new AudioEngine();
