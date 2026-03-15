import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Search, FileText } from "lucide-react";

const Documents = () => {
  return (
    <div className="flex flex-col">
      <AppHeader title="Documents" subtitle="Central document management" />
      <div className="flex-1 space-y-4 p-4 lg:p-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search documents..." className="pl-9 h-9" />
          </div>
          <Button size="sm"><Upload className="h-4 w-4 mr-1" /> Upload</Button>
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No documents uploaded yet</p>
            <p className="text-xs mt-1">Upload passports, visas, contracts, and other files</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Documents;
