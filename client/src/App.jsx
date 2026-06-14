import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
  PieChart, Pie
} from 'recharts';
import { 
  Upload, AlertTriangle, CheckCircle, RefreshCw, ListFilter, ArrowRightLeft, 
  HelpCircle, ShieldCheck, Database, DollarSign, Users, Info, PlusCircle, MinusCircle,
  ChevronLeft, ChevronRight, X, PlayCircle
} from 'lucide-react';

const API_BASE = 'http://localhost:4000/api';

export default function App() {
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [balances, setBalances] = useState({ simplifiedDebts: [], auditTrails: {} });
  const [selectedUser, setSelectedUser] = useState('');
  const [loading, setLoading] = useState(false);

  // Pagination & Filtering state for Staged Resolutions
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Filter state for Personal History Table ('ALL', 'CREDIT', 'DEBIT')
  const [ledgerFilter, setLedgerFilter] = useState('ALL');
  
  // Pagination state for Personal History Table
  const [historyPage, setHistoryPage] = useState(1);
  const historyItemsPerPage = 10;

  // Website Tour State (0 means no tour active, 1 to 4 represent the steps)
  const [tourStep, setTourStep] = useState(0);

  const fetchData = async () => {
    try {
      setLoading(true);
      const balRes = await fetch(`${API_BASE}/balances`);
      const balData = await balRes.json();
      setBalances(balData);

      const users = Object.keys(balData.auditTrails || {});
      if (users.length > 0 && !selectedUser) {
        setSelectedUser(users[0]);
      }

      const anomRes = await fetch(`${API_BASE}/anomalies`);
      const anomData = await anomRes.json();
      setAnomalies(anomData);
      setCurrentPage(1);
      setHistoryPage(1); // Reset history page on refresh
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploadStatus({ type: 'info', message: 'Uploading and parsing CSV...' });
      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setUploadStatus({
          type: 'success',
          message: `Import complete! Added ${data.sessionSummary.expensesInserted} expenses, ${data.sessionSummary.settlementsInserted} settlements, and staged ${data.sessionSummary.staged} rows.`
        });
        fetchData();
      } else {
        setUploadStatus({ type: 'error', message: data.error || 'Upload failed' });
      }
    } catch (err) {
      setUploadStatus({ type: 'error', message: err.message });
    }
  };

  const handleResolve = async (stagedExpenseId, action) => {
    try {
      const res = await fetch(`${API_BASE}/staged/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stagedExpenseId, action })
      });
      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to resolve row');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const usersList = Object.keys(balances.auditTrails || {});
  const activeAudit = selectedUser ? balances.auditTrails[selectedUser] : null;

  // Reset page when user selection or filter changes
  useEffect(() => {
    setHistoryPage(1);
  }, [selectedUser, ledgerFilter]);

  // Prepare chart data: Net balances of all members
  const netBalanceChartData = usersList.map(name => {
    const bal = balances.auditTrails[name]?.summary?.netBalance || 0;
    return { name, balance: bal };
  });

  // Prepare chart data: Total amount paid by each member (contributions)
  const paidContributionChartData = usersList.map(name => {
    const paid = balances.auditTrails[name]?.summary?.totalPaid || 0;
    return { name, value: paid };
  }).filter(item => item.value > 0);

  const COLORS = ['#4f46e5', '#10b981', '#3b82f6', '#f43f5e', '#f59e0b', '#8b5cf6'];

  // Overall KPI statistics
  const totalGroupExpenses = usersList.reduce((sum, name) => {
    return sum + (balances.auditTrails[name]?.summary?.totalPaid || 0);
  }, 0);

  // Grouping & Filtering staged items
  const filteredAnomalies = anomalies.filter(staged => {
    if (selectedCategory === 'ALL') return true;
    return staged.anomalies.some(anom => anom.type === selectedCategory);
  });

  // Paginated staged items
  const totalPages = Math.ceil(filteredAnomalies.length / itemsPerPage) || 1;
  const paginatedAnomalies = filteredAnomalies.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Get count of unique anomaly categories for filters
  const categoryCounts = anomalies.reduce((acc, staged) => {
    staged.anomalies.forEach(anom => {
      acc[anom.type] = (acc[anom.type] || 0) + 1;
    });
    return acc;
  }, {});

  // Filtered Ledger List
  const filteredLedger = activeAudit ? activeAudit.ledger.filter(item => {
    if (ledgerFilter === 'ALL') return true;
    if (ledgerFilter === 'CREDIT') return item.effect === '+';
    if (ledgerFilter === 'DEBIT') return item.effect === '-';
    return true;
  }) : [];

  // Paginated history items
  const totalHistoryPages = Math.ceil(filteredLedger.length / historyItemsPerPage) || 1;
  const paginatedLedger = filteredLedger.slice(
    (historyPage - 1) * historyItemsPerPage,
    historyPage * historyItemsPerPage
  );

  // Tour Steps Details
  const tourDetails = [
    {
      title: "Welcome to Flatmate Expense Splitter!",
      text: "This app helps you upload expense spreadsheets, check them for errors (like double-charging or wrong dates), and calculates the easiest way for everyone to pay each other back. Let's take a quick 4-step tour!"
    },
    {
      title: "Step 1: Upload Expense File",
      text: "Use this section to select and load your raw spreadsheet file (*.csv). The app will automatically scan every row, convert currencies, and look for mistakes."
    },
    {
      title: "Step 2: Review & Fix Errors",
      text: "If the app finds duplicates or incorrect math, it holds them here. You can click 'Approve' to force-import them, or 'Reject' to delete them from staging."
    },
    {
      title: "Step 3: Easiest Repayments (Who pays whom)",
      text: "Instead of everyone sending tiny amounts back and forth, the app simplifies the math here. It lists the exact minimum transfers needed to settle all debts."
    },
    {
      title: "Step 4: Detailed Personal History",
      text: "Select any flatmate from the dropdown to inspect their entire transaction list. You can click 'Credit' or 'Debit' blocks to filter what they spent vs what they owe."
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased relative">
      
      {/* TOUR MODAL OVERLAY */}
      {tourStep > 0 && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-indigo-150 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded">
                Tour: Step {tourStep} of 4
              </span>
              <button onClick={() => setTourStep(0)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-lg font-black text-slate-900">{tourDetails[tourStep].title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{tourDetails[tourStep].text}</p>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => setTourStep(prev => prev - 1)}
                disabled={tourStep === 1}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-xs font-bold rounded-lg transition-colors cursor-pointer text-slate-700"
              >
                Previous
              </button>
              <button
                onClick={() => {
                  if (tourStep === 4) {
                    setTourStep(0);
                  } else {
                    setTourStep(prev => prev + 1);
                  }
                }}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-sm"
              >
                {tourStep === 4 ? "Finish Tour" : "Next Step"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EASY LANGUAGE NAVBAR */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 text-white p-2.5 rounded-lg shadow-md">
              <Database className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Flatmate Expense Splitter
              </h1>
              <p className="text-xs text-slate-500 font-medium">Upload bills, fix errors, and calculate balances easily</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTourStep(1)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-extrabold rounded-lg transition-all cursor-pointer"
            >
              <PlayCircle className="h-4 w-4" />
              Take App Tour
            </button>
            <button 
              onClick={fetchData} 
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh Data
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        
        {/* KPI OVERVIEW CARDS */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="bg-indigo-50 text-indigo-600 p-3 rounded-lg">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Total Flat Expenses</span>
              <span className="text-xl font-bold text-slate-900">₹{totalGroupExpenses.toLocaleString('en-IN')}</span>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="bg-rose-50 text-rose-600 p-3 rounded-lg">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Errors Found</span>
              <span className="text-xl font-bold text-slate-900">{anomalies.length} Pending</span>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="bg-emerald-50 text-emerald-600 p-3 rounded-lg">
              <ArrowRightLeft className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Active Debts</span>
              <span className="text-xl font-bold text-slate-900">{balances.simplifiedDebts.length} Transfers</span>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="bg-blue-50 text-blue-600 p-3 rounded-lg">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Active Flatmates</span>
              <span className="text-xl font-bold text-slate-900">{usersList.length} People</span>
            </div>
          </div>
        </section>

        {/* ANALYTICAL VISUALIZATION ROW */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Net balance chart */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
            <div className="mb-4">
              <h2 className="text-md font-bold text-slate-900 flex items-center gap-1.5">
                Group Balance Standings
                <span className="group relative cursor-pointer text-slate-400 hover:text-slate-600">
                  <HelpCircle className="h-4 w-4" />
                  <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-52 bg-slate-900 text-white text-[10px] p-2 rounded shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10 leading-normal">
                    Green bars mean they are owed money. Red bars mean they owe money.
                  </span>
                </span>
              </h2>
              <p className="text-xs text-slate-500">Visual view of who has paid more and who owes money overall.</p>
            </div>
            <div className="h-60">
              {netBalanceChartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-xs">No balance data available. Upload a CSV spreadsheet.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={netBalanceChartData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px' }}
                      labelStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                    />
                    <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />
                    <Bar dataKey="balance" radius={[4, 4, 0, 0]}>
                      {netBalanceChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.balance >= 0 ? '#10b981' : '#f43f5e'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Contribution breakdown */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
            <div className="mb-4">
              <h2 className="text-md font-bold text-slate-900">Who Paid the Most</h2>
              <p className="text-xs text-slate-500">Comparison of who spent the most out-of-pocket.</p>
            </div>
            <div className="h-44">
              {paidContributionChartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-xs">No records available.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paidContributionChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={65}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {paidContributionChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 border-t border-slate-100 pt-4 mt-2">
              {paidContributionChartData.map((entry, idx) => (
                <div key={entry.name} className="flex items-center gap-1.5 truncate">
                  <span className="h-2 w-2 rounded-full inline-block shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></span>
                  <span className="truncate font-semibold">{entry.name}: ₹{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* OPERATIONS GRID: UPLOAD, RESOLUTIONS & NETTING */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Uploader Dropzone Panel */}
          <div id="step-1-upload" className={`bg-white rounded-xl border p-6 shadow-sm space-y-4 transition-all ${tourStep === 1 ? 'ring-4 ring-indigo-500/30 border-indigo-400 scale-[1.02]' : 'border-slate-200'}`}>
            <div>
              <h2 className="text-md font-bold text-indigo-750 flex items-center gap-1.5">
                <Upload className="h-5 w-5 text-indigo-600" />
                1. Upload Expense File
              </h2>
              <p className="text-xs text-slate-500 mt-1">Upload the raw Excel/CSV spreadsheet here to scan for double charges or bad math.</p>
            </div>
            
            <form onSubmit={handleFileUpload} className="space-y-4">
              <div className="border border-dashed border-slate-350 bg-slate-50 hover:bg-slate-100/50 rounded-lg p-6 text-center cursor-pointer transition-colors relative">
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setFile(e.target.files[0])}
                  className="w-full text-xs text-slate-500 file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white file:cursor-pointer hover:file:bg-indigo-500"
                />
                <p className="text-[10px] text-slate-400 mt-2">Spreadsheet files allowed: *.csv</p>
              </div>
              <button
                type="submit"
                disabled={!file}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-sm"
              >
                Scan & Load File
              </button>
            </form>

            {uploadStatus && (
              <div className={`p-3 rounded text-xs leading-normal border ${uploadStatus.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : uploadStatus.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
                {uploadStatus.message}
              </div>
            )}
          </div>

          {/* Staging Control Center (Meera's View) with Category Filtering & Pagination */}
          <div id="step-2-stage" className={`bg-white rounded-xl border p-6 shadow-sm space-y-4 transition-all ${tourStep === 2 ? 'ring-4 ring-indigo-500/30 border-indigo-400 scale-[1.02]' : 'border-slate-200'}`}>
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <div>
                <h2 className="text-md font-bold text-rose-600 flex items-center gap-1.5">
                  <AlertTriangle className="h-5 w-5 text-rose-500" />
                  2. Review & Fix Errors
                </h2>
                <p className="text-[11px] text-slate-500">Fix duplicates or wrong math here.</p>
              </div>
              <span className="bg-rose-50 text-rose-700 border border-rose-200 text-xs px-2 py-0.5 rounded-full font-extrabold shrink-0">
                {filteredAnomalies.length} Error{filteredAnomalies.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Category Filter Badges */}
            {anomalies.length > 0 && (
              <div className="flex flex-wrap gap-1.5 py-1">
                <button
                  onClick={() => { setSelectedCategory('ALL'); setCurrentPage(1); }}
                  className={`text-[9px] px-2 py-1 rounded-md font-bold border transition-colors cursor-pointer ${selectedCategory === 'ALL' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'}`}
                >
                  ALL ({anomalies.length})
                </button>
                {Object.entries(categoryCounts).map(([catName, count]) => (
                  <button
                    key={catName}
                    onClick={() => { setSelectedCategory(catName); setCurrentPage(1); }}
                    className={`text-[9px] px-2 py-1 rounded-md font-bold border transition-colors cursor-pointer ${selectedCategory === catName ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {catName} ({count})
                  </button>
                ))}
              </div>
            )}

            {filteredAnomalies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center bg-slate-50 border border-slate-100 rounded-lg">
                <ShieldCheck className="h-8 w-8 text-emerald-500 mb-2" />
                <p className="text-xs text-slate-700 font-bold">Staging Clean</p>
                <p className="text-[10px] text-slate-400 mt-0.5">No anomalies match the selected category filter.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                  {paginatedAnomalies.map((staged) => (
                    <div key={staged.id} className="bg-slate-50 rounded-lg p-4 border border-slate-250 space-y-3 shadow-xs">
                      <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                        <span className="text-[10px] text-slate-500 font-black uppercase">CSV Row Index: {staged.raw_row_index}</span>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleResolve(staged.id, 'approve')}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded cursor-pointer transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleResolve(staged.id, 'reject')}
                            className="bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold px-2 py-1 rounded cursor-pointer transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-600 bg-white p-2.5 rounded border border-slate-200">
                        <p className="truncate"><strong>Desc:</strong> {staged.raw_data.description || 'N/A'}</p>
                        <p className="truncate"><strong>Paid By:</strong> {staged.raw_data.paid_by || 'N/A'}</p>
                        <p className="truncate"><strong>Cost:</strong> {staged.raw_data.amount || 'N/A'} {staged.raw_data.currency || 'INR'}</p>
                        <p className="truncate"><strong>Split:</strong> {staged.raw_data.split_with || 'N/A'}</p>
                      </div>

                      <div className="space-y-1">
                        {staged.anomalies.map((anom) => (
                          <div key={anom.id} className="text-[10px] bg-rose-50 border border-rose-100 text-rose-700 p-2 rounded flex gap-1.5 items-start">
                            <span className="font-extrabold uppercase shrink-0">[{anom.type}]</span>
                            <span className="leading-tight">{anom.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="text-[11px] text-slate-500">
                      Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                    </span>
                    <div className="inline-flex gap-1.5">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="p-1 rounded bg-slate-100 border border-slate-200 text-slate-600 disabled:opacity-40 cursor-pointer hover:bg-slate-200"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="p-1 rounded bg-slate-100 border border-slate-200 text-slate-600 disabled:opacity-40 cursor-pointer hover:bg-slate-200"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Aisha's View: Debt Simplification Net Matrix */}
          <div id="step-3-debts" className={`bg-white rounded-xl border p-6 shadow-sm space-y-4 transition-all ${tourStep === 3 ? 'ring-4 ring-indigo-500/30 border-indigo-400 scale-[1.02]' : 'border-slate-200'}`}>
            <div>
              <h2 className="text-md font-bold text-emerald-700 flex items-center gap-1.5">
                <ArrowRightLeft className="h-5 w-5 text-emerald-600" />
                3. Easiest Repayments
              </h2>
              <p className="text-xs text-slate-500 mt-1">Easiest repayment plan to clear all flatmate balances using the minimum number of bank transfers.</p>
            </div>
            
            {balances.simplifiedDebts.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs bg-slate-50 border border-slate-100 rounded-lg">
                No active settlement transactions computed.
              </div>
            ) : (
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                {balances.simplifiedDebts.map((txn, index) => (
                  <div key={index} className="flex items-center justify-between p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-[11px] text-slate-600">
                      <span className="font-bold text-rose-600">{txn.from.name}</span>
                      <span className="text-slate-400 mx-1.5 font-medium">pays</span>
                      <span className="font-bold text-emerald-600">{txn.to.name}</span>
                    </div>
                    <div className="text-md font-black text-indigo-750 font-mono">
                      ₹{txn.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ROHAN'S VIEW: DETAILED AUDIT TRAIL */}
        <section id="step-4-ledger" className={`bg-white rounded-xl border p-6 shadow-sm space-y-6 transition-all ${tourStep === 4 ? 'ring-4 ring-indigo-500/30 border-indigo-400 scale-[1.01]' : 'border-slate-200'}`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-md font-bold text-slate-900 flex items-center gap-1.5">
                <ListFilter className="h-5 w-5 text-indigo-600" />
                4. Personal Transaction History ({selectedUser || 'No User'}'s Ledger)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 font-medium flex items-center gap-2">
                Use the dropdown to inspect a flatmate. Click the Credit/Debit cards or table buttons to filter results!
                {ledgerFilter !== 'ALL' && (
                  <button 
                    onClick={() => setLedgerFilter('ALL')}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] text-indigo-600 font-bold border border-indigo-200 rounded transition-all cursor-pointer"
                  >
                    Clear Filter ({ledgerFilter})
                    <X className="h-3 w-3" />
                  </button>
                )}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-bold">Select Active Flatmate:</span>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs rounded-lg px-3.5 py-2.5 focus:outline-none focus:border-indigo-500 cursor-pointer font-extrabold shadow-sm"
              >
                {usersList.map(usr => (
                  <option key={usr} value={usr}>{usr}</option>
                ))}
              </select>
            </div>
          </div>

          {activeAudit ? (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              
              {/* LEDGER DATA TABLE (COLS 1-3) */}
              <div className="lg:col-span-3 space-y-6">
                {/* Metrics grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div 
                    onClick={() => setLedgerFilter(ledgerFilter === 'CREDIT' ? 'ALL' : 'CREDIT')}
                    className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-sm select-none ${ledgerFilter === 'CREDIT' ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20' : 'bg-slate-50 border-slate-250'}`}
                  >
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Total Spent (Out of Pocket)</span>
                    <p className="text-md font-black text-emerald-700 mt-1">₹{activeAudit.summary.totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                    <span className="text-[9px] text-emerald-600 font-bold mt-1 inline-block">Click to show only Credits ➔</span>
                  </div>
                  
                  <div 
                    onClick={() => setLedgerFilter(ledgerFilter === 'DEBIT' ? 'ALL' : 'DEBIT')}
                    className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-sm select-none ${ledgerFilter === 'DEBIT' ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500/20' : 'bg-slate-50 border-slate-250'}`}
                  >
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Their Split Share (Owed Costs)</span>
                    <p className="text-md font-black text-rose-700 mt-1">₹{activeAudit.summary.totalOwed.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                    <span className="text-[9px] text-rose-600 font-bold mt-1 inline-block">Click to show only Debits ➔</span>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-250 self-center h-full flex flex-col justify-center">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Settled Amount (Repayments)</span>
                    <p className="text-md font-black text-slate-700 mt-1">₹{(activeAudit.summary.totalSent - activeAudit.summary.totalReceived).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                  </div>
                  
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-250 bg-indigo-50/20 border-indigo-200 self-center h-full flex flex-col justify-center">
                    <span className="text-[10px] text-indigo-700 uppercase font-bold tracking-wider">Final Standing (Net Balance)</span>
                    <p className={`text-lg font-black mt-1 ${activeAudit.summary.netBalance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      ₹{activeAudit.summary.netBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* Ledger Table */}
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-250 text-[10px] uppercase text-slate-400 font-black tracking-wider">
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Transaction Details</th>
                          <th className="py-3 px-4 text-right">Amount (INR)</th>
                          <th className="py-3 px-4 text-center">Effect</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {paginatedLedger.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-55 transition-colors">
                            <td className="py-3 px-4 text-slate-500 font-mono font-medium">{new Date(item.date).toLocaleDateString()}</td>
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-700">{item.description}</div>
                              <div className="flex gap-1.5 items-center mt-1">
                                <span className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">{item.type.replace('_', ' ')}</span>
                                <span className="h-1 w-1 rounded-full bg-slate-300"></span>
                                <span className="text-[9px] text-slate-400 font-mono">Reference: {item.id.substring(0, 8)}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-black text-slate-800 font-mono">₹{item.amount.toFixed(2)}</td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => setLedgerFilter(item.effect === '+' ? 'CREDIT' : 'DEBIT')}
                                title={`Click to filter table by ${item.effect === '+' ? 'Credits' : 'Debits'}`}
                                className={`px-2.5 py-1.5 rounded-md text-[10px] font-black inline-flex items-center gap-1 cursor-pointer hover:shadow-xs transition-all ${item.effect === '+' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100'}`}
                              >
                                {item.effect === '+' ? <PlusCircle className="h-3 w-3 shrink-0" /> : <MinusCircle className="h-3 w-3 shrink-0" />}
                                {item.effect === '+' ? 'Credit' : 'Debit'}
                              </button>
                            </td>
                          </tr>
                        ))}
                        {filteredLedger.length === 0 && (
                          <tr>
                            <td colSpan="4" className="text-center text-slate-400 py-10 font-medium bg-slate-50/30">No matching transactions in this filtered ledger list.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* History Pagination Controls */}
                  {totalHistoryPages > 1 && (
                    <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                      <span className="text-[11px] text-slate-500">
                        Showing page <strong>{historyPage}</strong> of <strong>{totalHistoryPages}</strong> (total {filteredLedger.length} items)
                      </span>
                      <div className="inline-flex gap-1.5">
                        <button
                          onClick={() => setHistoryPage(prev => Math.max(prev - 1, 1))}
                          disabled={historyPage === 1}
                          className="p-1.5 rounded bg-slate-100 border border-slate-200 text-slate-600 disabled:opacity-40 cursor-pointer hover:bg-slate-200"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setHistoryPage(prev => Math.min(prev + 1, totalHistoryPages))}
                          disabled={historyPage === totalHistoryPages}
                          className="p-1.5 rounded bg-slate-100 border border-slate-200 text-slate-600 disabled:opacity-40 cursor-pointer hover:bg-slate-200"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* INFORMATION & LEGEND PANEL (COL 4) */}
              <div className="lg:col-span-1 bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-4 self-start">
                <h3 className="text-xs uppercase font-extrabold tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Info className="h-4 w-4 text-indigo-600" />
                  Ledger User Guide
                </h3>
                
                <div className="space-y-3.5 text-xs leading-relaxed text-slate-600">
                  <div className="space-y-1">
                    <p className="font-bold text-slate-800">1. Selecting Flatmates</p>
                    <p className="text-[11px] text-slate-500">The dropdown menu switches the audited context. When selected, the charts, overview metrics, and details table automatically update to match their balance spreadsheet history.</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-slate-800">2. Interactive Filters</p>
                    <p className="text-[11px] text-slate-500">
                      Click either the <strong>Total Paid</strong> metric block, the <strong>Total Owed</strong> metric block, or any table <strong>Credit / Debit</strong> button to filter the table immediately. 
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-slate-800">3. Effect Indicators</p>
                    <ul className="space-y-1 text-[11px] text-slate-500">
                      <li className="flex items-center gap-1.5">
                        <PlusCircle className="h-3.5 w-3.5 text-emerald-600" />
                        <strong>Credit (+):</strong> Increases final standing (money owed *to* them).
                      </li>
                      <li className="flex items-center gap-1.5">
                        <MinusCircle className="h-3.5 w-3.5 text-rose-600" />
                        <strong>Debit (-):</strong> Decreases final standing (money they *owe*).
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

            </div>
          ) : (
            <p className="text-slate-500 text-center py-6">Select a member to view the audit log.</p>
          )}
        </section>

      </main>
    </div>
  );
}
