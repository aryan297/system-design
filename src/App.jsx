import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import SystemHLD from "./pages/SystemHLD";
import SystemLLD from "./pages/SystemLLD";
import "./styles/globals.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          {/* Generic routes — works for any systemId in the registry */}
          <Route path=":systemId/hld" element={<SystemHLD />} />
          <Route path=":systemId/lld" element={<SystemLLD />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
