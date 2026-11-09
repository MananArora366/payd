import { NextRequest, NextResponse } from 'next/server';
import { parseReceiptImage, SAMPLE_UAE_RECEIPTS } from '@/lib/ai/receipt-scan';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { image, mimeType, sample } = body;

    // Handle instant preset demo samples
    if (sample && typeof sample === 'string' && SAMPLE_UAE_RECEIPTS[sample]) {
      const sampleData = {
        ...SAMPLE_UAE_RECEIPTS[sample],
        date: new Date().toISOString().split('T')[0],
      };
      return NextResponse.json({ success: true, receipt: sampleData });
    }

    if (!image || typeof image !== 'string') {
      return NextResponse.json(
        { error: 'Missing image data (base64 string required)' },
        { status: 400 }
      );
    }

    const receipt = await parseReceiptImage(image, mimeType || 'image/jpeg');

    return NextResponse.json({ success: true, receipt });
  } catch (error: any) {
    console.error('Error in /api/ai/receipt-scan:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
