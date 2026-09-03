"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import {
  getProviderIconSrc,
  getProviderSymbolIcon,
  getProviderTextIcon,
  markProviderIconMissing,
} from "@/shared/utils/providerIcon";

function resolveSrc(src, providerId) {
  if (providerId) return getProviderIconSrc(providerId);
  if (!src) return null;
  const m = String(src).match(/^\/providers\/([^/]+)\.png$/i);
  if (m) return getProviderIconSrc(m[1]);
  return src;
}

export default function ProviderIcon({
  src,
  providerId,
  alt,
  size = 32,
  className = "",
  fallbackText = "?",
  fallbackColor,
}) {
  const effectiveSrc = resolveSrc(src, providerId);
  const [errored, setErrored] = useState(false);

  // Providers without a PNG render their registry-declared Material Symbol
  // (display.icon) or text icon (display.textIcon) so the grid stays visual
  // and no 404 request is made.
  const symbolIcon = providerId ? getProviderSymbolIcon(providerId) : "";
  const textIcon = providerId ? getProviderTextIcon(providerId) : "";
  const useSymbol = !!symbolIcon;
  const useText = !useSymbol && !!textIcon;

  if (!effectiveSrc || errored) {
    return (
      <span
        className={`inline-flex items-center justify-center font-bold rounded-lg ${className}`.trim()}
        style={{
          width: size,
          height: size,
          color: fallbackColor,
          fontSize: useSymbol ? Math.max(14, Math.floor(size * 0.6)) : Math.max(9, Math.floor(size * 0.34)),
        }}
      >
        {useSymbol ? (
          <span className="material-symbols-outlined" style={{ fontSize: Math.max(14, Math.floor(size * 0.6)) }}>
            {symbolIcon}
          </span>
        ) : useText ? (
          textIcon
        ) : (
          fallbackText
        )}
      </span>
    );
  }

  return (
    <img
      src={effectiveSrc}
      alt={alt}
      width={size}
      height={size}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => {
        const m = effectiveSrc.match(/^\/providers\/([^/]+)\.png$/i);
        if (m) markProviderIconMissing(m[1]);
        if (providerId) markProviderIconMissing(providerId);
        setErrored(true);
      }}
    />
  );
}

ProviderIcon.propTypes = {
  src: PropTypes.string,
  providerId: PropTypes.string,
  alt: PropTypes.string,
  size: PropTypes.number,
  className: PropTypes.string,
  fallbackText: PropTypes.string,
  fallbackColor: PropTypes.string,
};
