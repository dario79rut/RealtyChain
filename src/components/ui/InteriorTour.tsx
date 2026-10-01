import { Property } from '../../utils/types';
import { mediaUrl } from '../../utils/api';
import { propertyRoomCount, propertyWcCount } from '../../utils/propertyCounts';

function areaLabel(features: string[] | undefined) {
  return (features || []).find((feature) => /sq\s*ft/i.test(feature)) || null;
}

export function InteriorTour({ property }: { property: Property }) {
  const rooms = property.interiors || [];
  if (!rooms.length) return null;

  const roomsCount = propertyRoomCount(property);
  const wcs = propertyWcCount(property);
  const area = areaLabel(property.features);
  const summary = [
    roomsCount != null ? `${roomsCount} ${roomsCount === 1 ? 'room' : 'rooms'}` : null,
    wcs != null ? `${wcs} ${wcs === 1 ? 'WC' : 'WCs'}` : null,
    area,
  ].filter(Boolean);

  return (
    <section className="mb-10">
      <h2 className="font-display text-lg font-semibold text-cream-100 mb-2">Interior</h2>
      {summary.length > 0 && (
        <p className="text-cream-300 text-sm mb-1">{summary.join(' · ')}</p>
      )}
      <p className="text-cream-400 text-sm mb-6">
        Each room below is the interior of this listing: the photo, then how that space is finished and arranged.
      </p>
      <div className="space-y-10">
        {rooms.map((room, roomIndex) => (
          <article key={`${room.name}-${roomIndex}`}>
            <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-void-700 bg-void-900">
              <img
                src={mediaUrl(room.imageUrl)}
                alt={`${property.title}, ${room.name}`}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="mt-4 flex items-baseline justify-between gap-4">
              <h3 className="font-display text-2xl font-semibold text-cream-100">{room.name}</h3>
              <span className="text-cream-400 text-sm whitespace-nowrap">
                {roomIndex + 1} / {rooms.length}
              </span>
            </div>
            {room.detail && (
              <p className="text-cream-300 leading-relaxed mt-3 text-base">{room.detail}</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
