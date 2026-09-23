<template>
  <div class="login-page">
    <section class="login-visual">
      <CqBrand />
      <div class="login-copy">
        <div class="eyebrow text-[#E5CB8E] mb-4">
          Платформа развития сотрудников
        </div>
        <h1>Ваш путь.<br />Ваш темп.<br />Ваш следующий шаг.</h1>
        <p>
          Возможности становятся понятными, когда вы видите, куда они ведут.
        </p>
      </div>
      <div class="login-journey">
        <svg
          viewBox="0 0 460 170"
          role="img"
          aria-label="Ваш профиль, навыки, следующий шаг и цель"
        >
          <path
            d="M10 132C83 132 58 54 145 54S229 137 302 99 354 22 448 22"
            stroke="#88BBA8"
            stroke-opacity=".6"
            stroke-width="2"
            stroke-dasharray="6 7"
            fill="none"
          />
          <circle cx="34" cy="128" r="12" fill="#A8C9B2" />
          <circle cx="150" cy="54" r="15" fill="#EDBD57" />
          <circle cx="294" cy="103" r="12" fill="#DBE8C6" />
          <circle cx="439" cy="23" r="17" fill="#EDBD57" />
          <text x="4" y="164" fill="#C3DBC7" font-size="12">Ваш профиль</text>
          <text x="121" y="20" fill="#EBE5B9" font-size="12">Навыки</text>
          <text x="263" y="150" fill="#C3DBC7" font-size="12">
            Следующий шаг
          </text>
          <text x="407" y="65" fill="#EBE5B9" font-size="12">Цель</text>
        </svg>
      </div>
      <div class="login-footer">
        QCareer для HackAlem.<br />Без рейтингов, принуждения и обещаний
        автоматического повышения.
      </div>
    </section>
    <main class="login-form">
      <div class="login-form-inner">
        <div class="login-top">
          <CqTag color="green">Интерактивный прототип</CqTag><span>RU</span>
        </div>
        <slot />
      </div>
    </main>
  </div>
</template>
