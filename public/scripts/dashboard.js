const id = window.location.pathname.split("/").pop();

async function pegarDados() {
    let nomeLoja = document.getElementById("nome_loja");

    const response = await fetch(`http://localhost:3000/api/takeData/${id}`);

    const data = await response.json();

    console.log(data);

    nomeLoja.innerHTML = data.usr.usrName;
}
pegarDados();