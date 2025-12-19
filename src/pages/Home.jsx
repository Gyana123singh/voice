import { useState, useEffect, useRef } from "react";
import socket from "../socket";

export default function Home() {
  const [roomId, setRoomId] = useState("");
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);
  const sourceRef = useRef(null);

  const startAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      console.log(
        "Microphone access granted, tracks:",
        stream.getTracks().length
      );

      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      sourceRef.current = source;
      const processor = audioContextRef.current.createScriptProcessor(
        4096,
        1,
        1
      );

      processorRef.current = processor;

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        console.log("send samples", inputData.length);
        socket.emit("voice", {
          roomId,
          audio: Array.from(inputData),
        });
      };
    } catch (err) {
      console.error("Microphone access error:", err);
      alert(
        "Microphone access denied or not available. Check permissions and try again."
      );
    }
  };

  const playAudio = (audioData) => {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    const buffer = audioContext.createBuffer(
      1,
      audioData.length,
      audioContext.sampleRate
    );
    buffer.getChannelData(0).set(new Float32Array(audioData));

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start();
  };

  useEffect(() => {
    socket.on("voice", (data) => {
      const audioArr = Array.isArray(data) ? data : data?.audio;
      console.log("Received voice packet - samples:", audioArr?.length ?? 0);
      if (audioArr) playAudio(audioArr);
    });

    return () => socket.off("voice");
  }, []);

  const joinRoom = async () => {
    if (!roomId) return alert("Enter Room ID");
    console.log("Joining room:", roomId);
    socket.emit("join-room", { roomId });
    await startAudio();
    console.log("Audio started for room:", roomId);
  };

  const leaveRoom = () => {
    console.log("Leaving room:", roomId);
    socket.emit("leave-room", { roomId });
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    audioContextRef.current?.close();
    streamRef.current?.getTracks()?.forEach((t) => t.stop());
    streamRef.current = null;
  };

  return (
    <div style={{ padding: 40 }}>
      <h2>🎧 Voice Chat</h2>

      <input
        placeholder="Room ID"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
      />

      <br />
      <br />

      <button onClick={joinRoom}>Join</button>
      <button onClick={leaveRoom}>Leave</button>
    </div>
  );
}
