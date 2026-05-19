import "./App.css";
import { SpatialCanvas } from "./components/SpatialCanvas";
import { Toolbar } from "./components/Toolbar";

function App() {
  return (
    <div className="app-root">
      <Toolbar />
      <SpatialCanvas />
    </div>
  );
}

export default App;
