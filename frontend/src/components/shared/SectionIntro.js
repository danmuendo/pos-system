import React from 'react';

function SectionIntro({ eyebrow, title, description, actions = null, className = '' }) {
  return (
    <div className={`section-intro ${className}`.trim()}>
      <div className="section-intro-copy">
        {eyebrow ? <p className="section-intro-eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {description ? <p className="section-intro-description">{description}</p> : null}
      </div>
      {actions ? <div className="section-intro-actions">{actions}</div> : null}
    </div>
  );
}

export default SectionIntro;
