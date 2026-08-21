

Como tiene que funcionar el software.

Funcionara por proyecto es decir en la carpeta:
C:\Users\Roger Gómez Martínez

se creara .nexora

C:\Users\Roger Gómez Martínez\.nexora

y en esa carpeta se descargara todo lo necesario para hacer correr el programa, todo vivira en .nexora/

Y para crear un proyecto se creeara projects/ dentro el nombre de cada proyecto por ejemplo, test_api, al abrir el software se podra elegir que proyecto cargar.

Se puede crear un proyecto fuera de

C:\Users\Roger Gómez Martínez\.nexora\projects

pero tendra que tener una carpeta llamada .nexora que contiene la configuración necesaria que apunte a:
C:\Users\Roger Gómez Martínez\.nexora

por ejemplo

C:\Users\Roger Gómez Martínez\Desktop\test_api\.nexora -> C:\Users\Roger Gómez Martínez\.nexora

entonces se podran tener proyectos donde sea pero que apunte a la ruta de descarga, así se pueden subir proyectos a git, etc...


