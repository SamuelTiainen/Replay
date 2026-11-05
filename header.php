<?php if(!defined('ABSPATH'))exit; ?>
<!doctype html>
<html <?php language_attributes(); ?>>
    <head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width,initial-scale=1"><?php wp_head(); ?>
</head>
<body <?php body_class(); ?>><?php wp_body_open(); ?>
<a class="skip-link" href="#main">Siirry sisältöön</a>
<header class="site-header"><div class="container header-inner">
    <a class="brand" href="<?php echo esc_url(str27_language_url(str27_is_english()?'en':'fi')); ?>" aria-label="Striimaamo – etusivu">
        <?php if(has_custom_logo()){ $logo=get_theme_mod('custom_logo');echo wp_get_attachment_image($logo,'full',false,['class'=>'brand-logo','alt'=>'Striimaamo']);}
        else{echo 'STRIIMAAMO<span class="brand-dot">.</span>';} ?></a><button class="menu-toggle" aria-controls="site-nav" aria-expanded="false" aria-label="Avaa valikko"><span></span><span></span><span></span></button>
        
        <nav id="site-nav" class="site-nav" aria-label="Päävalikko">
            <a href="<?php echo esc_url(str27_language_url(str27_is_english()?'en':'fi')); ?>">Etusivu</a>
            <a href="<?php echo esc_url(str27_link('palvelut')); ?>">Palvelut</a>
            <a href="<?php echo esc_url(str27_link('tuotannot')); ?>">Tuotannot</a>
            <a href="<?php echo esc_url(str27_link('replay')); ?>">Replay <span class="nav-new">UUTTA</span></a>
            <a href="<?php echo esc_url(str27_link('yhteystiedot')); ?>">Yhteystiedot</a>
            <a class="btn btn-primary nav-cta" href="<?php echo esc_url(str27_link('yhteystiedot')); ?>#tarjouspyynto">Pyydä tarjous ↗</a>
        </nav>
        <div class="str27-languages" aria-label="Language">
            <a href="<?php echo esc_url(str27_language_url('fi')); ?>" <?php echo !str27_is_english()?'aria-current="page"':''; ?>>FI</a>
            <span>/</span>
            <a href="<?php echo esc_url(str27_language_url('en')); ?>" <?php echo str27_is_english()?'aria-current="page"':''; ?>>EN</a>
        </div></div>
    </header>