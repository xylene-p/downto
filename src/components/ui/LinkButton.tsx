'use client';

import React from 'react';

interface LinkButtonProps {
  onClick?: () => void;
  children: React.ReactNode;
}

const LinkButton: React.FC<LinkButtonProps> = ({ onClick, children }) => {
  return (
    <button
      className="cursor-pointer border-0 bg-transparent font-(family-name:--font-space-mono) text-xs text-neutral-700 underline"
      onClick={onClick}
    >
      {children}
    </button>
  );
};

export default LinkButton;
