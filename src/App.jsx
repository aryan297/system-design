import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import NetflixHLD from "./pages/NetflixHLD";
import NetflixLLD from "./pages/NetflixLLD";
import "./styles/globals.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="netflix/hld" element={<NetflixHLD />} />
          <Route path="netflix/lld" element={<NetflixLLD />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
