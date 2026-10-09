const PRODUCE = [
    { id: 'mango', name: 'Julie Mango', note: 'Ripe cut', image: '/market/mango.svg' },
    { id: 'banana', name: 'Ripe Banana', note: 'Bunch', image: '/market/banana.svg' },
    { id: 'breadfruit', name: 'Breadfruit', note: 'Roast ready', image: '/market/breadfruit.svg' },
    { id: 'callaloo', name: 'Callaloo', note: 'Fresh leaf', image: '/market/callaloo.svg' },
    { id: 'bonnet', name: 'Scotch Bonnet', note: 'Yard heat', image: '/market/scotch-bonnet.svg' },
    { id: 'avocado', name: 'Avocado Pear', note: 'Buttery', image: '/market/avocado.svg' },
    { id: 'pineapple', name: 'Pineapple', note: 'Sweet', image: '/market/pineapple.svg' },
    { id: 'plantain', name: 'Ripe Plantain', note: 'Fry / boil', image: '/market/plantain.svg' },
] as const;

type Props = {
    onPick?: (name: string) => void;
};

/** Visual market board — fruits & vegetables from the country stall. */
export default function MarketStall({ onPick }: Props) {
    return (
        <section className="market-stall" aria-label="Country market produce">
            <div className="market-stall-heading">
                <p className="eyebrow">Country market</p>
                <h2>Fruits &amp; vegetables</h2>
                <p className="market-stall-note">
                    Fresh from the stall — mango, callaloo, breadfruit, plantain, and more.
                </p>
            </div>
            <div className="market-produce-track">
                {PRODUCE.map((item, index) => (
                    <button
                        key={item.id}
                        type="button"
                        className="market-produce-card"
                        style={{ animationDelay: `${index * 60}ms` }}
                        onClick={() => onPick?.(item.name)}
                    >
                        <img src={item.image} alt="" width={160} height={105} loading="lazy" />
                        <span className="market-produce-name">{item.name}</span>
                        <span className="market-produce-note">{item.note}</span>
                    </button>
                ))}
            </div>
        </section>
    );
}
