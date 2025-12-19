import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import socket from "../socket";
import "./room.css";

export default function Room() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [participants, setParticipants] = useState([]);
  const [joined, setJoined] = useState(false);
  const [me, setMe] = useState(null);

  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);
  const sourceRef = useRef(null);

  useEffect(() => {
    // On mount, attempt to auto-join using sessionStorage or localStorage
    const joinKey = `rtc_joined_${id}`;
    const stored = sessionStorage.getItem(joinKey);
    let user = null;
    if (stored) {
      try {
        user = JSON.parse(stored);
      } catch (e) {}
    }

    if (!user) {
      // fallback to localStorage name/pic
      const name = localStorage.getItem("rtc_myName") || "";
      const pic = localStorage.getItem("rtc_myPic") || null;
      if (name) {
        user = {
          userId: `${name}-${Math.floor(Math.random() * 10000)}`,
          name,
          pic,
        };
      }
    }

    if (user) {
      setMe(user);
      socket.emit("join-room", { roomId: id, user });
      setJoined(true);
      startAudio(id);
    }

    socket.on("participants", (list) => {
      setParticipants(list || []);
    });

    socket.on("voice", (data) => {
      const audioArr = Array.isArray(data) ? data : data?.audio;
      if (audioArr) playAudio(audioArr);
    });

    return () => {
      socket.off("participants");
      socket.off("voice");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
      // do not force leave; user can still listen
    }
  };

  // Play incoming audio array (Float32 samples)
  const playAudio = (audioArr) => {
    try {
      if (!audioArr || !audioArr.length) return;
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext ||
          window.webkitAudioContext)();
      }
      const audioContext = audioContextRef.current;
      const buffer = audioContext.createBuffer(
        1,
        audioArr.length,
        audioContext.sampleRate
      );
      buffer.getChannelData(0).set(new Float32Array(audioArr));
      const src = audioContext.createBufferSource();
      src.buffer = buffer;
      src.connect(audioContext.destination);
      src.start();
    } catch (err) {
      console.error("playAudio error:", err);
    }
  };

  const leaveRoom = () => {
    const userId = me?.userId;
    socket.emit("leave-room", { roomId: id, userId });

    processorRef.current?.disconnect?.();
    sourceRef.current?.disconnect?.();
    audioContextRef.current?.close?.();
    streamRef.current?.getTracks?.forEach((t) => t.stop());
    streamRef.current = null;

    setJoined(false);
    sessionStorage.removeItem(`rtc_joined_${id}`);
    navigate("/");
  };

  return (
    <div className="room-root">
      <header className="room-header">
        <div className="room-creator">
          <div className="avatar big">
            {(me?.name || "?").charAt(0).toUpperCase()}
          </div>
          <div className="room-info">
            <div className="room-title">{participants[0]?.name || "Room"}</div>
            <div className="room-sub">ID: {id}</div>
          </div>
          <div className="room-actions">
            {!joined ? (
              <button
                className="btn-join"
                onClick={() => {
                  // trigger manual join if not auto joined
                  const name =
                    localStorage.getItem("rtc_myName") ||
                    prompt("Enter your name");
                  if (!name) return;
                  const user = {
                    userId: `${name}-${Math.floor(Math.random() * 10000)}`,
                    name,
                    pic: localStorage.getItem("rtc_myPic") || null,
                  };
                  localStorage.setItem("rtc_myName", name);
                  socket.emit("join-room", { roomId: id, user });
                  sessionStorage.setItem(
                    `rtc_joined_${id}`,
                    JSON.stringify(user)
                  );
                  setMe(user);
                  setJoined(true);
                  startAudio(id);
                }}
              >
                Join
              </button>
            ) : (
              <button className="btn-leave" onClick={leaveRoom}>
                Leave
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="room-main">
        <div className="participants-grid">
          {participants.map((p) => (
            <div key={p.userId} className="participant">
              <div className="avatar">
                {(p.name || "?").charAt(0).toUpperCase()}
              </div>
              <div className="pname">{p.name}</div>
            </div>
          ))}

          {/* placeholder locked or other slots */}
          {participants.length === 0 ? (
            <div className="empty">No participants yet</div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
