import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import RoomLanding from "./pages/RoomLanding";
import Room from "./pages/Room";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:id" element={<RoomLanding />} />
        <Route path="/room/:id/room" element={<Room />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
