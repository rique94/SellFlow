const id = window.location.pathname.split("/").pop();

let links = document.querySelectorAll('a[href="http://localhost:3000/novo-pedido"]');
links.forEach((link => {
    link.href = `http://localhost:3000/novo-pedido/${id}`;
}));

async function pegarDados() {
    let nomeLoja = document.getElementById("nome_loja");

    const response = await fetch(`http://localhost:3000/api/takeData/${id}`);

    const data = await response.json();

    console.log(data);

    nomeLoja.innerHTML = data.usr.usrName;

    return data;
}
const user = pegarDados();

