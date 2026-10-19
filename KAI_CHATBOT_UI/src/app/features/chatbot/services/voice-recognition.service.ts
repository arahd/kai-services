import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class VoiceRecognitionService {
  readonly isListening = signal<boolean>(false);
  readonly isVoiceConfirming = signal<boolean>(false);
  readonly tempTranscript = signal<string>('');
  readonly waveHeights = signal<number[]>(Array(90).fill(4));

  private recognition: any = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphoneSource: MediaStreamAudioSourceNode | null = null;
  private animationFrameId: number | null = null;
  private mediaStream: MediaStream | null = null;
  private dataArray: Uint8Array | null = null;
  private isConfirmingVoice = false;

  private readonly waveBars = Array(90).fill(0);

  async startVoice(onMicAccessError: (err: any) => void) {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Voice Recognition not supported in this browser');
      return;
    }

    if (this.isListening()) {
      return;
    }

    if (!this.recognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.lang = 'en-US';
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;

      this.recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((r: any) => r[0].transcript)
          .join('');
        this.tempTranscript.set(transcript);
      };

      this.recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (!this.isListening()) {
          return;
        }
        if (event.error === 'no-speech' || event.error === 'aborted') {
          return;
        }
        this.isListening.set(false);
        this.stopVoiceWaveAnimation();
      };

      this.recognition.onend = () => {
        if (!this.isListening()) {
          if (!this.isConfirmingVoice) {
            this.tempTranscript.set('');
          }
          return;
        }
        try {
          this.recognition.start();
        } catch {
          this.isListening.set(false);
          this.stopVoiceWaveAnimation();
        }
      };
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error('Mic access error:', err);
      onMicAccessError(err);
      return;
    }

    try {
      await this.startVoiceWaveAnimation(stream);
    } catch (err) {
      console.error('Voice wave setup error:', err);
      this.stopVoiceWaveAnimation();
      onMicAccessError(err);
      return;
    }

    this.tempTranscript.set('');
    this.isListening.set(true);
    try {
      this.recognition.start();
    } catch (e) {
      this.isListening.set(false);
      this.stopVoiceWaveAnimation();
    }
  }

  stopVoice() {
    this.isListening.set(false);
    this.stopVoiceWaveAnimation();
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        /* already stopped */
      }
    }
  }

  cancelVoiceMode() {
    this.stopVoiceWaveAnimation();
    this.stopVoice();
    this.tempTranscript.set('');
  }

  confirmVoiceInput(): string {
    this.isVoiceConfirming.set(true);
    const finalTranscript = this.tempTranscript().trim();
    this.isConfirmingVoice = true;

    this.stopVoiceWaveAnimation();
    this.stopVoice();

    this.tempTranscript.set('');
    this.isConfirmingVoice = false;
    
    // We defer setting isVoiceConfirming back to false to let the caller reflect the state update.
    setTimeout(() => {
      this.isVoiceConfirming.set(false);
    }, 50);

    return finalTranscript;
  }

  private async startVoiceWaveAnimation(preAcquiredStream: MediaStream) {
    this.stopVoiceWaveAnimation();

    this.mediaStream = preAcquiredStream;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioCtx();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;

    this.microphoneSource = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.microphoneSource.connect(this.analyser);

    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);

    this.animateWave();
  }

  private animateWave() {
    if (!this.analyser || !this.dataArray) return;

    this.analyser.getByteFrequencyData(this.dataArray as any);

    const barsCount = this.waveBars.length;
    const chunkSize = Math.floor(this.dataArray.length / barsCount);

    const heights = this.waveBars.map((_, i) => {
      const start = i * chunkSize;
      const end = start + chunkSize;

      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += this.dataArray![j] || 0;
      }

      const avg = sum / chunkSize || 0;

      // Convert audio value (0-255) to bar height
      const minHeight = 4;
      const maxHeight = 40;
      const normalized = avg / 255;
      return Math.round(minHeight + normalized * (maxHeight - minHeight));
    });

    this.waveHeights.set(heights);

    this.animationFrameId = requestAnimationFrame(() => this.animateWave());
  }

  private stopVoiceWaveAnimation() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
    this.microphoneSource = null;
    this.dataArray = null;

    this.waveHeights.set(this.waveBars.map(() => 4));
  }
}
