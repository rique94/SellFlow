let msg = document.getElementById("mensagem");

const login = document.getElementById("f_loja_login");
const passwd = document.getElementById("f_loja_password");
const form = document.getElementById("form");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (verifyValues(login.value, passwd.value)) {
        msg.innerHTML = "Está sem o usuário ou senha!";
        msg.className = "mensagem";
    }
    else {
        msg.innerHTML = "";
        msg.className = "";

        //trasnformando os dados em objeto pra dps tranformar em json
        const user = {
            usr: login.value,
            pwd: passwd.value
        }

        // enviando os dados para o login do sistema
        const response = await fetch("http://localhost:3000/api/login", {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(user)
        });
        

        if (response.status == 200) {
            msg.innerHTML = "";
            msg.className = "";

            const id = await response.json();

            window.location.replace(`http://localhost:3000/dashboard/${id}`);
        }
        else if (response.status == 401) {
            msg.innerHTML = "Nome, telefone ou senha estão incorretos";
            msg.className = "mensagem";
        }
    }
});

function verifyValues(login, passwd) {
    if (login == "") {
        return true;
    }
    else if (passwd == "") {
        return true
    }
    else {
        return false
    }
}
