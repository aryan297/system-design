import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import SystemHLD from "./pages/SystemHLD";
import SystemLLD from "./pages/SystemLLD";
import DSAPage from "./pages/DSAPage";
import { DSA_CATEGORIES } from "./data/dsa";
import "./styles/globals.css";

const firstCat = DSA_CATEGORIES[0];
const firstProblem = firstCat.problems[0];

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          {/* Generic routes — works for any systemId in the registry */}
          <Route path=":systemId/hld" element={<SystemHLD />} />
          <Route path=":systemId/lld" element={<SystemLLD />} />
          {/* DSA routes */}
          <Route
            path="dsa"
            element={<Navigate to={`/dsa/${firstCat.id}/${firstProblem.id}`} replace />}
          />
          <Route path="dsa/:categoryId/:problemId" element={<DSAPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
