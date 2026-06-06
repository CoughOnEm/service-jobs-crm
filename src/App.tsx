import { useState } from "react";
import PasswordScreen from "./PasswordScreen";
import ServiceJobsCRM from "./ServiceJobsCRM";

export default function App() {
  const [room, setRoom] = useState<string | null>(() => sessionStorage.getItem("room"));

  const handleUnlock = async (password: string) => {
    // Hash the password to create a room key
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    sessionStorage.setItem("room", hash);
    setRoom(hash);
  };

  const handleLock = () => {
    sessionStorage.removeItem("room");
    setRoom(null);
  };

  if (!room) return <PasswordScreen onUnlock={handleUnlock} />;
  return <ServiceJobsCRM room={room} onLock={handleLock} />;
}
