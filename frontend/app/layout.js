import './globals.css';
import Sidebar from './components/Sidebar';

export const metadata = {
  title: 'Calendly Clone - Scheduling Made Simple',
  description: 'A Calendly clone for scheduling meetings and booking time slots.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="app-layout">
          <Sidebar />
          {children}
        </div>
      </body>
    </html>
  );
}
