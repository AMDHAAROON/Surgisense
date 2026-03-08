import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full h-full flex items-center justify-center bg-transparent">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2 justify-center">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-650">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600 text-center">
            please check the url
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
