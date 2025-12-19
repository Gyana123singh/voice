import { useState, useEffect, useRef } from "react";
import socket from "../socket";

export default function Home() {
  const [roomId, setRoomId] = useState("");
  const [paramRoomId, setParamRoomId] = useState("");
  const [myName, setMyName] = useState("");
  const [myPic, setMyPic] = useState("");
  const [createdRoomId, setCreatedRoomId] = useState("");
  const [participants, setParticipants] = useState([]);

  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);
  const sourceRef = useRef(null);
  const nameInputRef = useRef(null);
  const autoJoinRef = useRef(false);

  // Detect room id from URL: ?id=... or ?roomId=... or path /room/:id
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const id =
        url.searchParams.get("id") ||
        url.searchParams.get("roomId") ||
        (url.pathname.match(/\/room\/([^\/]+)/) || [])[1];
      if (id) {
        setParamRoomId(id);
        setRoomId(id);
        console.log("Detected room id from URL:", id);
      }
    } catch (err) {
      // ignore malformed urls
    }
  }, []);

  // If a param room id exists and user already entered name, auto-join once
  useEffect(() => {
    if (!paramRoomId) return;
    if (autoJoinRef.current) return;
    if (myName) {
      autoJoinRef.current = true;
      joinRoom();
    } else {
      // focus name input so user can quickly fill it to auto-join
      nameInputRef.current?.focus?.();
    }
  }, [paramRoomId, myName]);

  const startAudio = async (targetRoomId) => {
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
        const rId = targetRoomId || roomId || paramRoomId;
        console.log("send samples", inputData.length, "room:", rId);
        socket.emit("voice", {
          roomId: rId,
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

    // Receive participants list updates
    socket.on("participants", (list) => {
      console.log("participants update", list);
      setParticipants(list || []);
    });

    return () => {
      socket.off("voice");
      socket.off("participants");
    };
  }, []);

  const joinRoom = async () => {
    const effectiveRoomId = roomId || paramRoomId;
    if (!effectiveRoomId) return alert("Enter Room ID or use a room link");
    if (!myName) return alert("Enter your name");

    const user = {
      userId: `${myName}-${Math.floor(Math.random() * 10000)}`,
      name: myName,
      pic: myPic || null,
    };

    console.log("Joining room:", effectiveRoomId, user);
    socket.emit("join-room", { roomId: effectiveRoomId, user });
    // ensure UI roomId matches effective one
    setRoomId(effectiveRoomId);
    await startAudio(effectiveRoomId);
    console.log("Audio started for room:", effectiveRoomId);
  };

  const leaveRoom = () => {
    console.log("Leaving room:", roomId || paramRoomId);
    const userId = participants.find((p) => p.socketId === socket.id)?.userId;
    socket.emit("leave-room", { roomId: roomId || paramRoomId, userId });
    processorRef.current?.disconnect?.();
    sourceRef.current?.disconnect?.();
    audioContextRef.current?.close?.();
    streamRef.current?.getTracks?.forEach((t) => t.stop());
    streamRef.current = null;
    setParticipants([]);
    setParamRoomId("");
    setRoomId("");
  };

  const createRoom = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/create", {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        const id = data.roomId;
        setCreatedRoomId(id);
        setRoomId(id);
        setParamRoomId(id);

        // Update URL so the room can be joined via link and navigate to landing page
        const newUrl = `${window.location.origin}/room/${id}`;
        try {
          // Save name/pic to localStorage so landing page can prefill
          localStorage.setItem("rtc_myName", myName);
          localStorage.setItem("rtc_myPic", myPic);
          window.location.href = `/room/${id}`;
        } catch (e) {
          // fallback: replace state
          try {
            window.history.replaceState({}, "", `/room/${id}`);
          } catch (e2) {}
        }

        // copy link to clipboard if available (best-effort)
        try {
          await navigator.clipboard.writeText(newUrl);
        } catch (e) {}

        // Inform the user
        alert("Room created: " + id + " (link copied to clipboard)");
      } else {
        alert("Failed to create room");
      }
    } catch (err) {
      console.error("Create room error", err);
      alert("Failed to create room");
    }
  };

  // Duplicate joinRoom/leaveRoom removed — using the single implementations defined earlier

  return (
    <div style={{ padding: 40 }}>
      <h2>🎧 Voice Chat</h2>

      <div style={{ marginBottom: 12 }}>
        <label>
          <strong>Name:</strong>
        </label>
        <br />
        <input
          ref={nameInputRef}
          placeholder="Your display name"
          value={myName}
          onChange={(e) => setMyName(e.target.value)}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>
          <strong>Pic URL (optional):</strong>
        </label>
        <br />
        <input
          placeholder="https://..."
          value={myPic}
          onChange={(e) => setMyPic(e.target.value)}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <button onClick={createRoom}>Create Room</button>

        {createdRoomId ? (
          <div style={{ marginTop: 8 }}>
            <div>
              <strong>Shareable link:</strong>
            </div>
            <div style={{ marginTop: 6 }}>
              <input
                readOnly
                value={`${window.location.origin}/room/${createdRoomId}`}
                style={{ width: 360 }}
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `${window.location.origin}/room/${createdRoomId}`
                    );
                    alert("Link copied to clipboard");
                  } catch (err) {
                    alert("Unable to copy link. Select and copy manually.");
                  }
                }}
                style={{ marginLeft: 8 }}
              >
                Copy Link
              </button>
              <button
                onClick={() => {
                  setRoomId(createdRoomId);
                  setParamRoomId(createdRoomId);
                  if (myName) joinRoom();
                  else nameInputRef.current?.focus?.();
                }}
                style={{ marginLeft: 8 }}
              >
                Join Room
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ marginBottom: 12 }}>
        <input
          placeholder="Room ID"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
        />
        <button onClick={joinRoom} style={{ marginLeft: 8 }}>
          Join
        </button>
        <button onClick={leaveRoom} style={{ marginLeft: 8 }}>
          Leave
        </button>
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
