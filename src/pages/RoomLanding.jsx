import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import socket from "../socket";

export default function RoomLanding() {
  const [roomId, setRoomId] = useState("");
  const [name, setName] = useState(
    () => localStorage.getItem("rtc_myName") || ""
  );
  const [pic, setPic] = useState(() => localStorage.getItem("rtc_myPic") || "");
  const [participants, setParticipants] = useState([]);
  const [joined, setJoined] = useState(false);

  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);
  const sourceRef = useRef(null);

  useEffect(() => {
    const id = (window.location.pathname.match(/\/room\/([^\/]+)/) || [])[1];
    if (id) setRoomId(id);
  }, []);

  useEffect(() => {
    socket.on("participants", (list) => {
      setParticipants(list || []);
    });

    socket.on("voice", (data) => {
      // optional: play remote audio while on landing if joined
      const audioArr = Array.isArray(data) ? data : data?.audio;
      if (audioArr && joined) {
        const audioContext = audioContextRef.current;
        if (!audioContext) return;
        const buffer = audioContext.createBuffer(
          1,
          audioArr.length,
          audioContext.sampleRate
        );
        buffer.getChannelData(0).set(new Float32Array(audioArr));
        const s = audioContext.createBufferSource();
        s.buffer = buffer;
        s.connect(audioContext.destination);
        s.start();
      }
    });

    return () => {
      socket.off("participants");
      socket.off("voice");
    };
  }, [joined]);

  const startAudio = async (rId) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

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
        socket.emit("voice", { roomId: rId, audio: Array.from(inputData) });
      };
    } catch (err) {
      console.error("Microphone access error:", err);
      alert(
        "Microphone access denied or not available. Check permissions and try again."
      );
    }
  };

  const navigate = useNavigate();

  const join = async () => {
    if (!roomId) return alert("Room ID missing");
    if (!name) return alert("Enter your display name to join");

    const user = {
      userId: `${name}-${Math.floor(Math.random() * 10000)}`,
      name,
      pic: pic || null,
    };

    localStorage.setItem("rtc_myName", name);
    localStorage.setItem("rtc_myPic", pic);

    // Emit join intent and navigate to the in-room page where audio will begin
    socket.emit("join-room", { roomId, user });
    sessionStorage.setItem(`rtc_joined_${roomId}`, JSON.stringify(user));
    navigate(`/room/${roomId}/room`);
  };

  const leave = () => {
    const userId = participants.find((p) => p.socketId === socket.id)?.userId;
    socket.emit("leave-room", { roomId, userId });

    processorRef.current?.disconnect?.();
    sourceRef.current?.disconnect?.();
    audioContextRef.current?.close?.();
    streamRef.current?.getTracks?.forEach((t) => t.stop());
    streamRef.current = null;
    setJoined(false);
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>Room</h2>
      <div style={{ marginBottom: 12 }}>
        <strong>Room ID:</strong> {roomId || "—"}
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>
          <strong>Name</strong>
        </label>
        <br />
        <input
          placeholder="Your display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>
          <strong>Pic URL (optional)</strong>
        </label>
        <br />
        <input
          placeholder="https://..."
          value={pic}
          onChange={(e) => setPic(e.target.value)}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        {!joined ? (
          <button
            onClick={join}
            style={{ background: "#2ecc71", color: "white" }}
          >
            Join Room
          </button>
        ) : (
          <button
            onClick={leave}
            style={{ background: "#e74c3c", color: "white" }}
          >
            Leave Room
          </button>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <h3>Participants ({participants.length})</h3>
        <ul>
          {participants.map((p) => (
            <li key={p.userId} style={{ marginBottom: 8 }}>
              <img
                src={p.pic || "https://placehold.co/40x40"}
                alt={p.name}
                width={40}
                height={40}
                style={{
                  borderRadius: 20,
                  marginRight: 8,
                  verticalAlign: "middle",
                }}
              />
              <span style={{ marginRight: 8 }}>
                <strong>{p.name}</strong>
              </span>
              <span style={{ color: "#666" }}>{p.userId}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
