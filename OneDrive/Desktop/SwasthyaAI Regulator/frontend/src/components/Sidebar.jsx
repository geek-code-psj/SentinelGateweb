import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  Upload,
  FileText,
  CheckSquare,
  Settings,
  HelpCircle,
  Shield,
  BarChart3,
  Lock,
  Zap,
  CheckCircle,
} from 'lucide-react';

export default function Sidebar({ isOpen }) {
  const location = useLocation();

  const menuItems = [
    {
      label: 'Dashboard',
      path: '/',
      icon: Home,
      description: 'View all submissions',
    },
    {
      label: 'Upload Document',
      path: '/upload',
      icon: Upload,
      description: 'Process new document',
    },
    {
      label: 'Analytics',
      path: '/analytics',
      icon: BarChart3,
      description: 'View insights and reports',
    },
    {
      label: 'Compliance',
      path: '#',
      icon: CheckSquare,
      description: 'View compliance status',
      disabled: true,
    },
    {
      label: 'Settings',
      path: '/settings',
      icon: Settings,
      description: 'User preferences',
    },
  ];

  const cdscoFeatures = [
    {
      label: 'Data Anonymiser',
      path: '/anonymiser',
      icon: Lock,
      description: 'PII/PHI detection & anonymization',
    },
    {
      label: 'Classification',
      path: '/classifier',
      icon: Zap,
      description: 'Severity & risk prioritization',
    },
    {
      label: 'Summarisation',
      path: '/summariser',
      icon: FileText,
      description: 'Document summarization',
    },
    {
      label: 'Completeness',
      path: '/completeness-checker',
      icon: CheckCircle,
      description: 'Data quality validation',
    },
  ];

  const complianceFrameworks = [
    { name: 'DPDP Act 2023', status: 'Implemented' },
    { name: 'NDHM', status: 'Implemented' },
    { name: 'ICMR Guidelines', status: 'Implemented' },
    { name: 'CDSCO Standards', status: 'Implemented' },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <aside
      className={`fixed lg:static top-16 left-0 bottom-0 w-64 bg-gray-50 border-r border-gray-200 transform transition-transform duration-300 z-30 ${
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}
    >
      <div className="h-full overflow-y-auto flex flex-col">
        {/* Main Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2">
          <h3 className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Menu
          </h3>
          {menuItems.map((item) => (
            <div key={item.path}>
              {!item.disabled ? (
                <Link
                  to={item.path}
                  className={`flex items-start space-x-3 px-3 py-3 rounded-lg transition-colors group ${
                    isActive(item.path)
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <item.icon className="w-5 h-5 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">{item.label}</p>
                    <p className="text-xs text-gray-500 group-hover:text-gray-600">
                      {item.description}
                    </p>
                  </div>
                </Link>
              ) : (
                <div className="flex items-start space-x-3 px-3 py-3 rounded-lg opacity-50 cursor-not-allowed">
                  <item.icon className="w-5 h-5 mt-0.5 text-gray-400" />
                  <div>
                    <p className="font-medium text-sm text-gray-400">{item.label}</p>
                    <p className="text-xs text-gray-400">{item.description}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* CDSCO Stage 1 Features */}
        <nav className="px-4 py-6 space-y-2 border-t border-gray-200">
          <h3 className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            CDSCO Tools
          </h3>
          {cdscoFeatures.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-start space-x-3 px-3 py-3 rounded-lg transition-colors group ${
                location.pathname === item.path
                  ? 'bg-purple-100 text-purple-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <item.icon className="w-5 h-5 mt-0.5" />
              <div>
                <p className="font-medium text-sm">{item.label}</p>
                <p className="text-xs text-gray-500 group-hover:text-gray-600">
                  {item.description}
                </p>
              </div>
            </Link>
          ))}
        </nav>

        {/* Compliance Frameworks Section */}
        <div className="px-4 py-6 border-t border-gray-200">
          <h3 className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4" />
              <span>Compliance</span>
            </div>
          </h3>
          <div className="space-y-2">
            {complianceFrameworks.map((framework) => (
              <div
                key={framework.name}
                className="px-3 py-2 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
              >
                <p className="text-xs font-medium text-gray-900">{framework.name}</p>
                <p className="text-xs text-green-600 font-semibold mt-1">
                  ✓ {framework.status}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Help Section */}
        <div className="px-4 py-6 border-t border-gray-200">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <HelpCircle className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-blue-900">Need Help?</h4>
                <p className="text-xs text-blue-700 mt-1">
                  Check our documentation or contact support.
                </p>
                <button className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700">
                  View Documentation →
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <div className="px-4 py-4 border-t border-gray-200 text-xs text-gray-600">
          <p className="font-semibold mb-1">Version 1.0.0</p>
          <p>Production Ready</p>
          <p className="mt-2">© 2024 SwasthyaAI</p>
        </div>
      </div>
    </aside>
  );
}
