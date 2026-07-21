import crossLogo from '../assets/cross-logo.png';

export default function CrossMark({ size = 52 }) {
  return (
    <img
      src={crossLogo}
      alt="Cross Soluções"
      width={size}
      height={size}
      style={{ objectFit: 'contain', display: 'block' }}
    />
  );
}
