import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useCreateContactMessage } from "@/hooks/use-contact";
import { useToast } from "@/hooks/use-toast";
import { Mail, Send, User, AtSign, Github, Linkedin, Twitter } from "lucide-react";

export default function About() {
  const devs = [
    { name: "saarathy", role: "", focus: "", initials: "SG" },
    { name: "Vishal", role: "", focus: "", initials: "VR" },
    { name: "Subhash", role: "", focus: "", initials: "SB" },
    { name: "Haaroon", role: "", focus: "", initials: "AM" },
  ];

  const { toast } = useToast();
  const create = useCreateContactMessage();
  const [formData, setFormData] = useState({ name: "", email: "", message: "" });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await create.mutateAsync(formData);
      toast({ title: "Message Sent", description: "We'll get back to you shortly." });
      setFormData({ name: "", email: "", message: "" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-16 py-8">
      <section className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">The Team Behind SurgiTrack</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          We're a dedicated group of engineers and designers focused on making surgical training safer and more data-driven.
        </p>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {devs.map((dev) => (
          <Card key={dev.name} className="border-none shadow-sm hover:shadow-md transition-all text-center">
            <CardContent className="pt-8 pb-6 space-y-4">
              <Avatar className="h-20 w-20 mx-auto border-2 border-primary/10">
                <AvatarFallback className="text-xl font-bold bg-primary/5 text-primary">
                  {dev.initials}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <h3 className="font-bold text-lg">{dev.name}</h3>
                <p className="text-sm text-primary font-medium">{dev.role}</p>
              </div>
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">{dev.focus}</Badge>
              <div className="flex justify-center gap-2 pt-2">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"><Github className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"><Twitter className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-12 pt-8">
        <div className="space-y-6">
          <h2 className="text-3xl font-bold">Get in Touch</h2>
          <p className="text-muted-foreground leading-relaxed">
            Have questions about our detection algorithms or interested in a partnership? Drop us a line and our team will respond as soon as possible.
          </p>
          <div className="space-y-4 pt-4">
            <div className="flex items-center gap-4 text-muted-foreground">
              <div className="h-10 w-10 rounded-full bg-primary/5 flex items-center justify-center text-primary">
                <Mail className="h-5 w-5" />
              </div>
              <span>contact@surgitrack.io</span>
            </div>
          </div>
        </div>

        <Card className="border-none shadow-xl">
          <CardContent className="p-8">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input 
                      placeholder="John Doe" 
                      className="pl-9" 
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email Address</label>
                  <div className="relative">
                    <AtSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input 
                      type="email" 
                      placeholder="john@example.com" 
                      className="pl-9" 
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Your Message</label>
                <Textarea 
                  placeholder="How can we help you?" 
                  className="min-h-[120px] resize-none" 
                  value={formData.message}
                  onChange={e => setFormData({...formData, message: e.target.value})}
                  required
                />
              </div>
              <Button type="submit" className="w-full h-11 text-base gap-2" disabled={create.isPending}>
                {create.isPending ? "Sending..." : "Send Message"} <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
