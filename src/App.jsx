import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import PWABadge from "./components/PWABadge";
import Home from "./pages/Home";
import SystemHLD from "./pages/SystemHLD";
import SystemLLD from "./pages/SystemLLD";
import DSAPage from "./pages/DSAPage";
import LayersPage from "./pages/LayersPage";
import EncyclopediaPage from "./pages/EncyclopediaPage";
import MachineCodingPage from "./pages/MachineCodingPage";
import GoBasicsPage from "./pages/GoBasicsPage";
import CodeReviewPage from "./pages/CodeReviewPage";
import SDInterviewPage from "./pages/SDInterviewPage";
import { DSA_CATEGORIES } from "./data/dsa";
import { MC_CATEGORIES } from "./data/machineCoding";
import { GO_BASICS_CATEGORIES } from "./data/goBasics";
import { CR_CATEGORIES } from "./data/codeReview";
import { SDI_CATEGORIES } from "./data/sdInterview";
import "./styles/globals.css";

const firstCat = DSA_CATEGORIES[0];
const firstProblem = firstCat.problems[0];
const firstMC = MC_CATEGORIES[0];
const firstMCProblem = firstMC.problems[0];
const firstGB = GO_BASICS_CATEGORIES[0];
const firstGBTopic = firstGB.topics[0];
const firstCR = CR_CATEGORIES[0];
const firstCRProblem = firstCR.problems[0];
const firstSDI = SDI_CATEGORIES[0];
const firstSDIProblem = firstSDI.problems[0];

export default function App() {
  return (
    <BrowserRouter>
      <PWABadge />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          {/* Layers of System Design */}
          <Route path="layers" element={<LayersPage />} />
          {/* SD Encyclopedia */}
          <Route path="encyclopedia" element={<EncyclopediaPage />} />
          {/* Generic routes — works for any systemId in the registry */}
          <Route path=":systemId/hld" element={<SystemHLD />} />
          <Route path=":systemId/lld" element={<SystemLLD />} />
          {/* DSA routes */}
          <Route
            path="dsa"
            element={<Navigate to={`/dsa/${firstCat.id}/${firstProblem.id}`} replace />}
          />
          <Route path="dsa/:categoryId/:problemId" element={<DSAPage />} />
          {/* Machine Coding routes */}
          <Route
            path="machine-coding"
            element={<Navigate to={`/machine-coding/${firstMC.id}/${firstMCProblem.id}`} replace />}
          />
          <Route path="machine-coding/:categoryId/:problemId" element={<MachineCodingPage />} />
          {/* Go Basics routes */}
          <Route
            path="go-basics"
            element={<Navigate to={`/go-basics/${firstGB.id}/${firstGBTopic.id}`} replace />}
          />
          <Route path="go-basics/:categoryId/:topicId" element={<GoBasicsPage />} />
          {/* Code Review routes */}
          <Route
            path="code-review"
            element={<Navigate to={`/code-review/${firstCR.id}/${firstCRProblem.id}`} replace />}
          />
          <Route path="code-review/:categoryId/:problemId" element={<CodeReviewPage />} />
          {/* System Design Interview Guide routes */}
          <Route
            path="system-design-guide"
            element={<Navigate to={`/system-design-guide/${firstSDI.id}/${firstSDIProblem.id}`} replace />}
          />
          <Route path="system-design-guide/:categoryId/:problemId" element={<SDInterviewPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
