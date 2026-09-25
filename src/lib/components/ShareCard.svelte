<script lang="ts">
  import { t, locale } from '$lib/i18n';
  import QRCode from 'qrcode';

  // Business-card style share card: QR + plan preview + attribution.
  // Rendered on an offscreen-sized canvas shown scaled; download exports PNG.
  let { url, projectName, owner, thumbnail }: {
    url: string;
    projectName: string;
    owner: string;
    thumbnail?: string | null;
  } = $props();

  const W = 960, H = 600; // 2x for crisp downloads
  let canvas = $state<HTMLCanvasElement>();
  let cardUrl = $state<string | null>(null);

  function fitImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
    const scale = Math.min(w / img.width, h / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  async function render() {
    if (!canvas || !url) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const qrUrl = await QRCode.toDataURL(url, { margin: 1, width: 400, errorCorrectionLevel: 'M' });
    const qr = new Image();
    qr.src = qrUrl;
    await qr.decode();

    let thumb: HTMLImageElement | null = null;
    if (thumbnail) {
      thumb = new Image();
      thumb.src = thumbnail;
      await thumb.decode().catch(() => { thumb = null; });
    }

    // Card
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    const pad = 60, qrSize = 300, gap = 48;
    // QR (left)
    ctx.drawImage(qr, pad, pad, qrSize, qrSize);
    ctx.strokeRect(pad - 1, pad - 1, qrSize + 2, qrSize + 2);

    // Preview (right)
    const px = pad + qrSize + gap, pw = W - px - pad, ph = qrSize;
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(px, pad, pw, ph);
    if (thumb) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(px + 1, pad + 1, pw - 2, ph - 2);
      ctx.clip();
      fitImage(ctx, thumb, px + 1, pad + 1, pw - 2, ph - 2);
      ctx.restore();
    } else {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '400 26px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText($t('share.cardNoPreview'), px + pw / 2, pad + ph / 2 + 9);
    }

    // Footer
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 44px system-ui, sans-serif';
    const name = projectName || $t('library.untitled');
    ctx.fillText(name.length > 26 ? name.slice(0, 25) + '…' : name, pad, pad + qrSize + 96);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#475569';
    ctx.font = '400 32px system-ui, sans-serif';
    ctx.fillText($t('share.cardBy', { name: owner }), W - pad, pad + qrSize + 96);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 28px system-ui, sans-serif';
    ctx.fillText('Created by CYAN Housing Planner', W / 2, H - 48);

    cardUrl = canvas.toDataURL('image/png');
  }

  $effect(() => { void render(); });

  function download() {
    if (!cardUrl) return;
    const a = document.createElement('a');
    a.href = cardUrl;
    a.download = `${(projectName || 'plan').replace(/[^\w一-鿿-]+/g, '-').replace(/^-+|-+$/g, '') || 'plan'}-share-card.png`;
    a.click();
  }
</script>

<div>
  <p class="text-sm font-medium text-gray-700">{$t('share.card')}</p>
  <!-- Rendered to canvas, shown as an <img> so mobile long-press gets the
       native save/share menu. -->
  <canvas bind:this={canvas} width={W} height={H} hidden></canvas>
  {#if cardUrl}
    <img src={cardUrl} alt={$t('share.cardAlt', { name: projectName || $t('library.untitled') })}
      class="mt-1 w-full rounded-lg border border-gray-200" />
  {/if}
  <div class="mt-2 flex justify-end">
    <button type="button" onclick={download} disabled={!cardUrl}
      class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
      {$t('share.cardDownload')}
    </button>
  </div>
</div>
