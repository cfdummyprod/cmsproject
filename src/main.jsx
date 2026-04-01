import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Preview support for banner clicks in the editor
window.handleFloatingButtonClick = () => {
    console.log("Floating button clicked (Editor Preview)");
    alert("Banner Click Triggered (External Widget Demo)");
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
