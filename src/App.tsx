/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Play, Square, Activity, Server, Shield, Key } from 'lucide-react';

export default function App() {
  const [isHosting, setIsHosting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');
  const [token, setToken] = useState(localStorage.getItem('discord_bot_token') || '');

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/bot/status');
      const data = await res.json();
      setIsHosting(data.isHosting);
    } catch (error) {
      console.error('Failed to fetch bot status', error);
      setStatusMessage('Failed to connect to server.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleHost = async () => {
    if (!token.trim()) {
      setStatusMessage('Please enter a valid bot token.');
      return;
    }
    
    localStorage.setItem('discord_bot_token', token.trim());
    setIsLoading(true);
    setStatusMessage('Starting bot...');
    try {
      const res = await fetch('/api/bot/start', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setIsHosting(true);
        setStatusMessage('Bot is now online.');
      } else {
        setStatusMessage(data.message || 'Failed to start bot.');
      }
    } catch (error) {
      setStatusMessage('Error connecting to server.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    setIsLoading(true);
    setStatusMessage('Stopping bot...');
    try {
      const res = await fetch('/api/bot/stop', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setIsHosting(false);
        setStatusMessage('Bot is now offline.');
      } else {
        setStatusMessage(data.message || 'Failed to stop bot.');
      }
    } catch (error) {
      setStatusMessage('Error connecting to server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#1a1a1a] font-sans flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden">
        
        {/* Header */}
        <div className="p-8 border-b border-black/5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center">
              <Server className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Bot Control Panel</h1>
              <p className="text-sm text-gray-500 mt-1">Manage your Discord bot instance</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${isHosting ? 'bg-emerald-500' : 'bg-gray-300'}`} />
            <span className="text-sm font-medium text-gray-600 uppercase tracking-wider">
              {isHosting ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-gray-50 rounded-xl p-6 border border-black/5">
              <div className="flex items-center gap-3 mb-2">
                <Activity className="w-5 h-5 text-gray-600" />
                <h2 className="font-medium">Status</h2>
              </div>
              <p className="text-sm text-gray-500">
                {isLoading ? 'Checking status...' : isHosting ? 'The bot is currently running and connected to Discord.' : 'The bot is stopped and disconnected.'}
              </p>
            </div>
            
            <div className="bg-gray-50 rounded-xl p-6 border border-black/5">
              <div className="flex items-center gap-3 mb-2">
                <Shield className="w-5 h-5 text-gray-600" />
                <h2 className="font-medium">Commands</h2>
              </div>
              <p className="text-sm text-gray-500">
                10 commands loaded, including moderation, utility, and voice features.
              </p>
            </div>
          </div>

          {/* Token Input */}
          <div className="mb-6">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Key className="w-4 h-4" />
              Bot Token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your Discord bot token here..."
              disabled={isHosting || isLoading}
              className="w-full px-4 py-3 rounded-xl border border-black/10 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black/5 transition-all disabled:opacity-50"
            />
            <p className="text-xs text-gray-400 mt-2">
              Your token is stored locally in your browser and sent securely to the server when hosting.
            </p>
          </div>

          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={handleHost}
              disabled={isHosting || isLoading || !token.trim()}
              className={`flex-1 flex items-center justify-center gap-2 py-4 px-6 rounded-xl font-medium transition-all duration-200 ${
                isHosting || isLoading || !token.trim()
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-black text-white hover:bg-gray-800 shadow-md hover:shadow-lg'
              }`}
            >
              <Play className="w-5 h-5" />
              Host Bot
            </button>
            
            <button
              onClick={handleStop}
              disabled={!isHosting || isLoading}
              className={`flex-1 flex items-center justify-center gap-2 py-4 px-6 rounded-xl font-medium transition-all duration-200 ${
                !isHosting || isLoading
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white text-black border border-black/10 hover:bg-gray-50 shadow-sm hover:shadow-md'
              }`}
            >
              <Square className="w-5 h-5" />
              Stop Hosting
            </button>
          </div>

          {/* Status Message */}
          {statusMessage && (
            <div className={`mt-6 text-center text-sm ${statusMessage.includes('Failed') || statusMessage.includes('Error') || statusMessage.includes('invalid') ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
              {statusMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
