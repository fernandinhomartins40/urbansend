import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Star } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { sharedTemplateApi } from '@/lib/api'
import { queryKeys } from '@/lib/queryClient'
import { cn } from '@/lib/utils'

interface TemplateRatingProps {
  templateId: number
  templateName: string
  currentRating?: number
  children: React.ReactNode
}

export const TemplateRating: React.FC<TemplateRatingProps> = ({
  templateId,
  templateName,
  currentRating = 0,
  children
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [rating, setRating] = useState(currentRating)
  const [hoverRating, setHoverRating] = useState(0)
  const [review, setReview] = useState('')

  const queryClient = useQueryClient()

  const ratingMutation = useMutation({
    mutationFn: async (data: { rating: number; review?: string }) => {
      return await sharedTemplateApi.rateTemplate(templateId, data)
    },
    onSuccess: () => {
      toast.success('Avaliação enviada com sucesso!')
      setIsOpen(false)
      setReview('')
      queryClient.invalidateQueries({ queryKey: queryKeys.templates.all })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erro ao avaliar template')
    }
  })

  const handleSubmit = () => {
    if (rating === 0) {
      toast.error('Por favor, selecione uma classificação')
      return
    }

    ratingMutation.mutate({
      rating,
      review: review.trim() || undefined
    })
  }

  const StarRating = ({
    value,
    onChange,
    onHover,
    size = 'md'
  }: {
    value: number
    onChange?: (value: number) => void
    onHover?: (value: number) => void
    size?: 'sm' | 'md' | 'lg'
  }) => {
    const sizeClasses = {
      sm: 'h-4 w-4',
      md: 'h-6 w-6',
      lg: 'h-8 w-8'
    }

    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className={cn(
              "transition-colors duration-150",
              onChange && "hover:scale-110"
            )}
            onClick={() => onChange?.(star)}
            onMouseEnter={() => onHover?.(star)}
            onMouseLeave={() => onHover?.(0)}
            disabled={!onChange}
          >
            <Star
              className={cn(
                sizeClasses[size],
                "transition-all duration-150",
                star <= (hoverRating || value)
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-gray-300 hover:text-yellow-400"
              )}
            />
          </button>
        ))}
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Avaliar Template: {templateName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label>Classificação *</Label>
            <div className="flex items-center gap-4">
              <StarRating
                value={rating}
                onChange={setRating}
                onHover={setHoverRating}
                size="lg"
              />
              <span className="text-sm text-gray-600">
                {rating > 0 && (
                  <>
                    {rating} de 5 estrelas
                    {hoverRating > 0 && hoverRating !== rating && (
                      <span className="text-gray-400"> (selecionando {hoverRating})</span>
                    )}
                  </>
                )}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="review">
              Comentário (opcional)
            </Label>
            <Textarea
              id="review"
              placeholder="Compartilhe sua experiência com este template..."
              value={review}
              onChange={(e) => setReview(e.target.value)}
              rows={4}
              maxLength={500}
            />
            <div className="text-xs text-gray-500 text-right">
              {review.length}/500
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={rating === 0 || ratingMutation.isPending}
            >
              {ratingMutation.isPending ? 'Enviando...' : 'Avaliar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Componente para exibir rating apenas (sem interação)
export const TemplateRatingDisplay: React.FC<{
  rating: number
  reviewCount?: number
  size?: 'sm' | 'md' | 'lg'
  showCount?: boolean
}> = ({
  rating,
  reviewCount = 0,
  size = 'md',
  showCount = true
}) => {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  }

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              sizeClasses[size],
              star <= Math.round(rating)
                ? "fill-yellow-400 text-yellow-400"
                : "text-gray-300"
            )}
          />
        ))}
      </div>

      {showCount && (
        <span className={cn("text-gray-600", textSizes[size])}>
          {rating.toFixed(1)} ({reviewCount})
        </span>
      )}
    </div>
  )
}

export { StarRating } from './TemplateRating'