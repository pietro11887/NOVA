// Foto dei piatti — generato da tools/build-photos.js, non modificare a mano.
// Fonte: Wikimedia Commons. Licenze libere (CC BY, CC BY-SA, CC0, pubblico dominio).
const PHOTOS = {
  "affogato": "photos/affogato.jpg",
  "aglio-olio": "photos/aglio-olio.jpg",
  "arrabbiata": "photos/arrabbiata.jpg",
  "banana-bread": "photos/banana-bread.jpg",
  "biscotti-burro": "photos/biscotti-burro.jpg",
  "bruschette": "photos/bruschette.jpg",
  "budino-cioccolato": "photos/budino-cioccolato.jpg",
  "burro-parmigiano": "photos/burro-parmigiano.jpg",
  "cacioepepe": "photos/cacioepepe.jpg",
  "caprese": "photos/caprese.jpg",
  "carbonara": "photos/carbonara.jpg",
  "ciambellone": "photos/ciambellone.jpg",
  "cookies": "photos/cookies.jpg",
  "coppa-greco": "photos/coppa-greco.jpg",
  "cotoletta": "photos/cotoletta.jpg",
  "couscous-tonno": "photos/couscous-tonno.jpg",
  "crepes": "photos/crepes.jpg",
  "crostata": "photos/crostata.jpg",
  "crumble": "photos/crumble.jpg",
  "frittata-patate": "photos/frittata-patate.jpg",
  "frittata-zucchine": "photos/frittata-zucchine.jpg",
  "hamburger": "photos/hamburger.jpg",
  "lasagne": "photos/lasagne.jpg",
  "macedonia": "photos/macedonia.jpg",
  "melanzane-funghetto": "photos/melanzane-funghetto.jpg",
  "mele-micro": "photos/mele-micro.jpg",
  "minestrone": "photos/minestrone.jpg",
  "mousse-cioccolato": "photos/mousse-cioccolato.jpg",
  "muffin-cioccolato": "photos/muffin-cioccolato.jpg",
  "mugcake": "photos/mugcake.jpg",
  "noodles-up": "photos/noodles-up.jpg",
  "pancakes": "photos/pancakes.jpg",
  "panna-cotta": "photos/panna-cotta.jpg",
  "parmigiana": "photos/parmigiana.jpg",
  "pasta-ceci": "photos/pasta-ceci.jpg",
  "pasta-pesto": "photos/pasta-pesto.jpg",
  "pasta-tonno": "photos/pasta-tonno.jpg",
  "patate-airfryer": "photos/patate-airfryer.jpg",
  "peperonata": "photos/peperonata.jpg",
  "piadina": "photos/piadina.jpg",
  "pollo-airfryer": "photos/pollo-airfryer.jpg",
  "pollo-curry": "photos/pollo-curry.jpg",
  "pollo-patate": "photos/pollo-patate.jpg",
  "polpette": "photos/polpette.jpg",
  "pomodoro": "photos/pomodoro.jpg",
  "ragu": "photos/ragu.jpg",
  "riso-cantonese": "photos/riso-cantonese.jpg",
  "risotto-funghi": "photos/risotto-funghi.jpg",
  "risotto-zafferano": "photos/risotto-zafferano.jpg",
  "salame-cioccolato": "photos/salame-cioccolato.jpg",
  "salmone": "photos/salmone.jpg",
  "scaloppine": "photos/scaloppine.jpg",
  "smoothie": "photos/smoothie.jpg",
  "sorrentina": "photos/sorrentina.jpg",
  "spinaci-saltati": "photos/spinaci-saltati.jpg",
  "tiramisu": "photos/tiramisu.jpg",
  "toast": "photos/toast.jpg",
  "tonno-cannellini": "photos/tonno-cannellini.jpg",
  "torta-cioccolato": "photos/torta-cioccolato.jpg",
  "torta-mele": "photos/torta-mele.jpg",
  "tortellini-brodo": "photos/tortellini-brodo.jpg",
  "uova-purgatorio": "photos/uova-purgatorio.jpg",
  "uova-strapazzate": "photos/uova-strapazzate.jpg",
  "uovo-micro": "photos/uovo-micro.jpg",
  "vellutata-zucca": "photos/vellutata-zucca.jpg",
  "verdure-forno": "photos/verdure-forno.jpg",
  "zuppa-lenticchie": "photos/zuppa-lenticchie.jpg",
};

const PHOTO_CREDITS = [
 {
  "file": "Affogato in an Irish Coffee glass. #homebarista #homecafe #summercoffe",
  "license": "CC BY 2.0",
  "author": "insidious_plots",
  "page": "https://www.flickr.com/photos/70928775@N00/28623148316",
  "id": "affogato"
 },
 {
  "id": "aglio-olio",
  "file": "Spaghetti_di_Gragnano_e_colatura_di_alici.jpg",
  "source": "wikipedia:it:Spaghetti aglio, olio e peperoncino",
  "license": "CC BY-SA 2.0",
  "author": "Elga Cappellari",
  "page": "https://commons.wikimedia.org/wiki/File:Spaghetti_di_Gragnano_e_colatura_di_alici.jpg"
 },
 {
  "id": "arrabbiata",
  "file": "Penne all'arrabbiata.jpg",
  "source": "commons",
  "license": "CC BY-SA 3.0",
  "author": "DC",
  "page": "https://commons.wikimedia.org/wiki/File:Penne_all'arrabbiata.jpg"
 },
 {
  "id": "banana-bread",
  "file": "Banana_bread_slices.jpg",
  "source": "wikipedia:en:Banana bread",
  "license": "CC BY 4.0",
  "author": "Shisma",
  "page": "https://commons.wikimedia.org/wiki/File:Banana_bread_slices.jpg"
 },
 {
  "id": "biscotti-burro",
  "file": "biscotti al burro con scaglie di cioccolato",
  "license": "CC BY 2.0",
  "author": "fugzu",
  "page": "https://www.flickr.com/photos/70253321@N00/2355206878"
 },
 {
  "id": "bruschette",
  "file": "Tomato Bruschetta",
  "license": "CC BY 2.0",
  "author": "Michael_Spencer",
  "page": "https://www.flickr.com/photos/76135747@N00/2881896624"
 },
 {
  "id": "budino-cioccolato",
  "file": "Souffle au chocolate - Bistro Vue",
  "license": "CC BY-SA 2.0",
  "author": "avlxyz",
  "page": "https://www.flickr.com/photos/10559879@N00/2461267274"
 },
 {
  "id": "burro-parmigiano",
  "file": "The_Only_Original_Alfredo_Sauce_with_Butter_and_Parmesano-Reggiano_Cheese.png",
  "source": "wikipedia:en:Pasta al burro",
  "license": "CC BY-SA 4.0",
  "author": "Meliciousm",
  "page": "https://commons.wikimedia.org/wiki/File:The_Only_Original_Alfredo_Sauce_with_Butter_and_Parmesano-Reggiano_Cheese.png"
 },
 {
  "id": "cacioepepe",
  "file": "Tonnarelli_cacio_e_pepe.jpg",
  "source": "wikipedia:it:Cacio e pepe",
  "license": "CC BY-SA 4.0",
  "author": "Camelia.boban",
  "page": "https://commons.wikimedia.org/wiki/File:Tonnarelli_cacio_e_pepe.jpg"
 },
 {
  "id": "caprese",
  "file": "Caprese-1_(tigher_crop).jpg",
  "source": "wikipedia:en:Caprese salad",
  "license": "CC BY-SA 3.0",
  "author": "Rainer Zenz",
  "page": "https://commons.wikimedia.org/wiki/File:Caprese-1_(tigher_crop).jpg"
 },
 {
  "id": "carbonara",
  "file": "Espaguetis_carbonara.jpg",
  "source": "wikipedia:it:Carbonara",
  "license": "CC BY-SA 4.0",
  "author": "Javier Somoza",
  "page": "https://commons.wikimedia.org/wiki/File:Espaguetis_carbonara.jpg"
 },
 {
  "id": "ciambellone",
  "file": "Ciambella,_in_Papierform_gebacken,_1.jpeg",
  "source": "wikipedia:it:Ciambellone",
  "license": "CC BY-SA 4.0",
  "author": "Renardo la vulpo",
  "page": "https://commons.wikimedia.org/wiki/File:Ciambella,_in_Papierform_gebacken,_1.jpeg"
 },
 {
  "id": "cookies",
  "file": "Plates of chocolate chip cookies with walnuts.jpg",
  "source": "commons",
  "license": "CC BY-SA 2.0",
  "author": "Ashley Bilodeau",
  "page": "https://commons.wikimedia.org/wiki/File:Plates_of_chocolate_chip_cookies_with_walnuts.jpg"
 },
 {
  "file": "Chobani SoHo",
  "license": "CC BY 2.0",
  "author": "missmeng",
  "page": "https://www.flickr.com/photos/41720539@N03/8126264276",
  "id": "coppa-greco"
 },
 {
  "id": "cotoletta",
  "file": "Milanesa.jpg",
  "license": "CC BY 2.0",
  "author": "mteson Marcelo Teson Los Angeles, CA, USA",
  "page": "https://commons.wikimedia.org/wiki/File:Milanesa.jpg"
 },
 {
  "id": "couscous-tonno",
  "file": "savory quinoa salad",
  "license": "CC BY 2.0",
  "author": "gamene",
  "page": "https://www.flickr.com/photos/12670507@N02/4743169618"
 },
 {
  "id": "crepes",
  "file": "Crepes_dsc07085.jpg",
  "source": "wikipedia:en:Crêpe",
  "license": "CC BY-SA 3.0",
  "author": "David Monniaux",
  "page": "https://commons.wikimedia.org/wiki/File:Crepes_dsc07085.jpg"
 },
 {
  "id": "crostata",
  "file": "Crostata con marmellata di ciliegie",
  "license": "CC BY 2.0",
  "author": "lsbardel",
  "page": "https://www.flickr.com/photos/10372764@N03/6931241577"
 },
 {
  "id": "crumble",
  "file": "Vegan_apple_crumble_(8293111737).jpg",
  "source": "wikipedia:en:Crumble",
  "license": "CC BY 2.0",
  "author": "Suzette - www.suzette.nu from Arnhem, Netherlands",
  "page": "https://commons.wikimedia.org/wiki/File:Vegan_apple_crumble_(8293111737).jpg"
 },
 {
  "id": "frittata-patate",
  "file": "-2020-01-31 Potato, Bacom and onion Tortilla, Trimingham.JPG",
  "license": "CC BY-SA 4.0",
  "author": "Kolforn (Kolforn)\nI'd appreciate if you could mail",
  "page": "https://commons.wikimedia.org/wiki/File:-2020-01-31_Potato,_Bacom_and_onion_Tortilla,_Trimingham.JPG"
 },
 {
  "id": "frittata-zucchine",
  "file": "Omelette I made for breakfast",
  "license": "CC BY 2.0",
  "author": "peregrine blue",
  "page": "https://www.flickr.com/photos/46786430@N00/2770954565"
 },
 {
  "id": "hamburger",
  "file": "RedDot_Burger.jpg",
  "source": "wikipedia:it:Hamburger (panino)",
  "license": "CC BY-SA 3.0",
  "author": "Hongreddotbrewhouse",
  "page": "https://commons.wikimedia.org/wiki/File:RedDot_Burger.jpg"
 },
 {
  "id": "lasagne",
  "file": "Midnight Lasagne Bolognese",
  "license": "CC BY-SA 4.0",
  "author": "Marijnswiki",
  "page": "https://commons.wikimedia.org/w/index.php?curid=136486652"
 },
 {
  "id": "macedonia",
  "file": "Fruktsallad_(Fruit_salad).jpg",
  "source": "wikipedia:en:Fruit salad",
  "license": "CC BY-SA 3.0",
  "author": "dnm",
  "page": "https://commons.wikimedia.org/wiki/File:Fruktsallad_(Fruit_salad).jpg"
 },
 {
  "id": "melanzane-funghetto",
  "file": "Melanzane a funghetto 1",
  "license": "CC BY 2.0",
  "author": "10Rosso",
  "page": "https://commons.wikimedia.org/w/index.php?curid=29568008"
 },
 {
  "id": "mele-micro",
  "file": "Hot_and_Sweet_Baked_Apples_-_50495578482.jpg",
  "source": "wikipedia:en:Baked apple",
  "license": "CC0",
  "author": "Alabama Extension",
  "page": "https://commons.wikimedia.org/wiki/File:Hot_and_Sweet_Baked_Apples_-_50495578482.jpg"
 },
 {
  "id": "minestrone",
  "file": "minestrone",
  "license": "CC BY 2.0",
  "author": "waldopics",
  "page": "https://www.flickr.com/photos/85056813@N00/3581699066"
 },
 {
  "id": "mousse-cioccolato",
  "file": "Mousse Dessert",
  "license": "CC BY 2.0",
  "author": "rexipe",
  "page": "https://www.flickr.com/photos/7352088@N08/826989461"
 },
 {
  "id": "muffin-cioccolato",
  "file": "cupcakes al doppio cioccolato e cuore di arancio",
  "license": "CC BY 2.0",
  "author": "fugzu",
  "page": "https://www.flickr.com/photos/70253321@N00/5957384166"
 },
 {
  "id": "mugcake",
  "file": "Tassenkuchen .jpg",
  "source": "commons",
  "license": "CC BY-SA 4.0",
  "author": "Mimschka",
  "page": "https://commons.wikimedia.org/wiki/File:Tassenkuchen_.jpg"
 },
 {
  "id": "noodles-up",
  "file": "Shin ramyun.jpg",
  "source": "commons",
  "license": "Public domain",
  "author": "",
  "page": "https://commons.wikimedia.org/wiki/File:Shin_ramyun.jpg"
 },
 {
  "id": "pancakes",
  "file": "Eating Pancakes (Unsplash).jpg",
  "source": "commons",
  "license": "CC0",
  "author": "Gabriel Gurrola gabrielgurrola",
  "page": "https://commons.wikimedia.org/wiki/File:Eating_Pancakes_(Unsplash).jpg"
 },
 {
  "id": "panna-cotta",
  "file": "panna cotta with a berry sauce",
  "license": "CC BY-SA 2.0",
  "author": "KLGreenNYC",
  "page": "https://www.flickr.com/photos/19479358@N00/5364900900"
 },
 {
  "id": "parmigiana",
  "file": "Parmigiana di melanzane.jpg",
  "source": "commons",
  "license": "CC BY-SA 4.0",
  "author": "Schellenberg",
  "page": "https://commons.wikimedia.org/wiki/File:Parmigiana_di_melanzane.jpg"
 },
 {
  "file": "pasta with chickpeas and pancetta",
  "license": "CC BY 2.0",
  "author": "Maggie Hoffman",
  "page": "https://www.flickr.com/photos/8830972@N08/3855897838",
  "id": "pasta-ceci"
 },
 {
  "id": "pasta-pesto",
  "file": "Pesto Pasta (Unsplash).jpg",
  "source": "commons",
  "license": "CC0",
  "author": "Eaters Collective eaterscollective",
  "page": "https://commons.wikimedia.org/wiki/File:Pesto_Pasta_(Unsplash).jpg"
 },
 {
  "id": "pasta-tonno",
  "file": "Spagetti al tonno e pomodoro",
  "license": "CC BY 2.0",
  "author": "Jun Seita",
  "page": "https://www.flickr.com/photos/90454079@N00/16369548125"
 },
 {
  "id": "patate-airfryer",
  "file": "Potato_wedges_at_Mensa_Paderborn_(11956794164).jpg",
  "source": "wikipedia:en:Potato wedges",
  "license": "CC BY 2.0",
  "author": "Luca Hammer from Paderborn, Germany",
  "page": "https://commons.wikimedia.org/wiki/File:Potato_wedges_at_Mensa_Paderborn_(11956794164).jpg"
 },
 {
  "id": "peperonata",
  "file": "Bell Pepper added after mashing",
  "license": "CC BY 2.0",
  "author": "jarrodlombardo",
  "page": "https://www.flickr.com/photos/62248962@N00/321641141"
 },
 {
  "id": "piadina",
  "file": "Piadina.jpg",
  "source": "wikipedia:it:Piadina",
  "license": "CC BY-SA 2.5",
  "author": "Kobako",
  "page": "https://commons.wikimedia.org/wiki/File:Piadina.jpg"
 },
 {
  "id": "pollo-airfryer",
  "file": "Crispy_Chicken_Strips_-_FotoosVanRobin.jpg",
  "source": "wikipedia:en:Chicken fingers",
  "license": "CC BY-SA 2.0",
  "author": "FotoosVanRobin from Netherlands",
  "page": "https://commons.wikimedia.org/wiki/File:Crispy_Chicken_Strips_-_FotoosVanRobin.jpg"
 },
 {
  "id": "pollo-curry",
  "file": "Chicken Gravy \"Jhol\".jpg",
  "source": "commons",
  "license": "CC BY-SA 4.0",
  "author": "Shukanto Das",
  "page": "https://commons.wikimedia.org/wiki/File:Chicken_Gravy_%22Jhol%22.jpg"
 },
 {
  "id": "pollo-patate",
  "file": "Pollastre al forn.jpg",
  "license": "CC BY-SA 4.0",
  "author": "E4024",
  "page": "https://commons.wikimedia.org/wiki/File:Pollastre_al_forn.jpg"
 },
 {
  "id": "polpette",
  "file": "Hackbällchen_mit_Tomatensugo_(5923210944).jpg",
  "source": "wikipedia:it:Polpetta",
  "license": "CC BY-SA 2.0",
  "author": "Katrin Gilger",
  "page": "https://commons.wikimedia.org/wiki/File:Hackb%C3%A4llchen_mit_Tomatensugo_(5923210944).jpg"
 },
 {
  "file": "spaghetti",
  "license": "CC BY 2.0",
  "author": "seelensturm",
  "page": "https://www.flickr.com/photos/61404197@N00/5451534765",
  "id": "pomodoro"
 },
 {
  "id": "ragu",
  "file": "Mitiche tagliatelle al ragù della “Gigina”, aka the best bolognese in ",
  "license": "CC BY 2.0",
  "author": "thepinkpeppercorn",
  "page": "https://www.flickr.com/photos/33904751@N04/4107689574"
 },
 {
  "id": "riso-cantonese",
  "file": "Fried Rice",
  "license": "CC BY 2.0",
  "author": "startcooking kathy & amandine",
  "page": "https://www.flickr.com/photos/70893713@N00/2760564240"
 },
 {
  "id": "risotto-funghi",
  "file": "Risotto Funghi Misti",
  "license": "CC BY-SA 2.0",
  "author": "Charles Haynes",
  "page": "https://www.flickr.com/photos/87232391@N00/4959579377"
 },
 {
  "id": "risotto-zafferano",
  "file": "Sun-rice_(11027684905).jpg",
  "source": "wikipedia:it:Risotto alla milanese",
  "license": "CC BY 2.0",
  "author": "grobery from Milano, Italy",
  "page": "https://commons.wikimedia.org/wiki/File:Sun-rice_(11027684905).jpg"
 },
 {
  "id": "salame-cioccolato",
  "file": "Salame_de_chocolate_-_Chocolat_Salami.jpg",
  "source": "wikipedia:it:Salame di cioccolato",
  "license": "CC BY-SA 4.0",
  "author": "jppaguilar",
  "page": "https://commons.wikimedia.org/wiki/File:Salame_de_chocolate_-_Chocolat_Salami.jpg"
 },
 {
  "id": "salmone",
  "file": "Liat Portal for Foodie Disorder - Salmon Fillet with Green Chili and Garlic.jpg",
  "source": "commons",
  "license": "CC BY-SA 4.0",
  "author": "HaJunkiyada",
  "page": "https://commons.wikimedia.org/wiki/File:Liat_Portal_for_Foodie_Disorder_-_Salmon_Fillet_with_Green_Chili_and_Garlic.jpg"
 },
 {
  "id": "scaloppine",
  "file": "Scaloppine_al_limone.jpg",
  "source": "wikipedia:it:Scaloppina",
  "license": "CC BY-SA 3.0",
  "author": "Xocolatl (talk) 15:26, 4 May 2014 (UTC)",
  "page": "https://commons.wikimedia.org/wiki/File:Scaloppine_al_limone.jpg"
 },
 {
  "file": "Morning Fruit Smoothy",
  "license": "CC BY 2.0",
  "author": "OakleyOriginals",
  "page": "https://www.flickr.com/photos/47264866@N00/3311066815",
  "id": "smoothie"
 },
 {
  "id": "sorrentina",
  "file": "Gnocchi_alla_sorrentina.jpg",
  "source": "wikipedia:it:Gnocchi alla sorrentina",
  "license": "CC BY 3.0",
  "author": "Davide Zambelli",
  "page": "https://commons.wikimedia.org/wiki/File:Gnocchi_alla_sorrentina.jpg"
 },
 {
  "id": "spinaci-saltati",
  "file": "Sauteed Spinach",
  "license": "CC BY-SA 2.0",
  "author": "Laurel Fan",
  "page": "https://www.flickr.com/photos/18295242@N00/313672816"
 },
 {
  "id": "tiramisu",
  "file": "Dessert Tiramisu.jpg",
  "source": "commons",
  "license": "CC BY 2.0",
  "author": "Javier Lastras",
  "page": "https://commons.wikimedia.org/wiki/File:Dessert_Tiramisu.jpg"
 },
 {
  "id": "toast",
  "file": "Lisboa L1190313 (24936285580).jpg",
  "source": "commons",
  "license": "CC BY-SA 2.0",
  "author": "tak.wing",
  "page": "https://commons.wikimedia.org/wiki/File:Lisboa_L1190313_(24936285580).jpg"
 },
 {
  "file": "tuna & white bean salad-2",
  "license": "CC BY 2.0",
  "author": "jules:stonesoup",
  "page": "https://www.flickr.com/photos/58367355@N00/10585910504",
  "id": "tonno-cannellini"
 },
 {
  "id": "torta-cioccolato",
  "file": "Chocolate Profiterole Cheesecake - Caffè Nero 2024-12-26.jpg",
  "source": "commons",
  "license": "CC0",
  "author": "Andy Li",
  "page": "https://commons.wikimedia.org/wiki/File:Chocolate_Profiterole_Cheesecake_-_Caff%C3%A8_Nero_2024-12-26.jpg"
 },
 {
  "id": "torta-mele",
  "file": "Torta di mele e mandorle",
  "license": "CC BY 2.0",
  "author": "fugzu",
  "page": "https://www.flickr.com/photos/70253321@N00/8039772785"
 },
 {
  "id": "tortellini-brodo",
  "file": "Tortellini in brodo",
  "license": "CC BY 2.0",
  "author": "WordRidden",
  "page": "https://www.flickr.com/photos/97844767@N00/15707428562"
 },
 {
  "id": "uova-purgatorio",
  "file": "Making shakshuka",
  "license": "CC BY 2.0",
  "author": "joyosity",
  "page": "https://www.flickr.com/photos/33993074@N00/9678057941"
 },
 {
  "id": "uova-strapazzate",
  "file": "Scrambed_eggs.jpg",
  "source": "wikipedia:it:Uova strapazzate",
  "license": "CC BY-SA 3.0",
  "author": "Takeaway",
  "page": "https://commons.wikimedia.org/wiki/File:Scrambed_eggs.jpg"
 },
 {
  "id": "uovo-micro",
  "file": "Fog_Eater_Cafe_-_April_2023_-_Sarah_Stierch_04.jpg",
  "source": "wikipedia:en:Poached egg",
  "license": "CC BY 4.0",
  "author": "Missvain",
  "page": "https://commons.wikimedia.org/wiki/File:Fog_Eater_Cafe_-_April_2023_-_Sarah_Stierch_04.jpg"
 },
 {
  "id": "vellutata-zucca",
  "file": "Mashup Soup",
  "license": "CC BY 2.0",
  "author": "cogdogblog",
  "page": "https://www.flickr.com/photos/37996646802@N01/8419280736"
 },
 {
  "id": "verdure-forno",
  "file": "Ratatouille_home_cooked.jpg",
  "source": "wikipedia:en:Ratatouille",
  "license": "CC0",
  "author": "Jack145945",
  "page": "https://commons.wikimedia.org/wiki/File:Ratatouille_home_cooked.jpg"
 },
 {
  "file": "Bowl Soup",
  "license": "CC0 1.0",
  "author": "Foodie Girl",
  "page": "https://stocksnap.io/photo/bowl-soup-WOZ7PQGMMI",
  "id": "zuppa-lenticchie"
 }
];
