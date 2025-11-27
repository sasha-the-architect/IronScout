import { notFound } from 'next/navigation'
import { getProduct } from '@/lib/api'
import { ProductDetails } from '@/components/products/product-details'

interface ProductPageProps {
  params: {
    id: string
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  try {
    const product = await getProduct(params.id)

    return (
      <div className="container mx-auto px-4 py-6">
        <ProductDetails product={product} />
      </div>
    )
  } catch (error) {
    notFound()
  }
}
