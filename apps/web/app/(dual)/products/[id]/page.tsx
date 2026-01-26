import { notFound } from 'next/navigation'
import { getProduct } from '@/lib/api'
import { ProductDetails } from '@/components/products/product-details'

interface ProductPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params
  try {
    const product = await getProduct(id)

    return (
      <div className="container mx-auto px-4 py-6">
        <ProductDetails product={product} />
      </div>
    )
  } catch (error) {
    notFound()
  }
}
