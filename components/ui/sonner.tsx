import { Toaster as SonnerToaster } from "sonner";

function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      toastOptions={{
        style: {
          background: "hsl(0 0% 6%)",
          border: "1px solid hsl(0 0% 14%)",
          color: "hsl(0 0% 100%)",
          borderRadius: "0",
        },
      }}
    />
  );
}

export { Toaster };
