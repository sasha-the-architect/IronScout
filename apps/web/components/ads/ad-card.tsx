import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, Zap } from 'lucide-react'
import type { Advertisement } from '@/lib/api'

interface AdCardProps {
  ad: Advertisement
}

export function AdCard({ ad }: AdCardProps) {
  const getAdTypeColor = (type: string) => {
    switch (type) {
      case 'SPONSORED_PRODUCT':
        return 'bg-blue-100 text-blue-800'
      case 'BANNER':
        return 'bg-purple-100 text-purple-800'
      default:
        return 'bg-green-100 text-green-800'
    }
  }

  return (
    <Card className="group hover:shadow-lg transition-all duration-200 overflow-hidden border-2 border-dashed border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5">
      <div className="relative">
        <div className="aspect-square relative overflow-hidden">
          <Image
            src={ad.imageUrl || '/placeholder-ad.jpg'}
            alt={ad.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-200"
          />
        </div>
        
        {/* Ad Badge */}
        <div className="absolute top-2 left-2">
          <Badge className={`flex items-center gap-1 ${getAdTypeColor(ad.adType)}`}>
            <Zap className="h-3 w-3" />
            Sponsored
          </Badge>
        </div>
      </div>

      <CardContent className="p-4">
        <div className="space-y-3">
          <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors">
            {ad.title}
          </h3>
          
          <p className="text-xs text-muted-foreground line-clamp-3">
            {ad.description}
          </p>

          <Button 
            size="sm" 
            className="w-full flex items-center justify-center gap-1"
            asChild
          >
            <a
              href={ad.targetUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-3 w-3" />
              Learn More
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
