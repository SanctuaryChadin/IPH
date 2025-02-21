import "@/app/globals.css";
import { sukhumvit } from '@/ui/fonts/fonts.js';
import TanstackWarp from "@/lib/tanstack.js"


export const metadata = {
  title: "IPH:Reservation",
  description: "IPH reservation system still in developing state",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${sukhumvit.variable} antialiased`}>
        <TanstackWarp>
          {children}
        </TanstackWarp>
      </body>
    </html>
  );
}
